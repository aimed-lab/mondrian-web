"""
Mondrian Map — Scalable Database Ingestion Pipeline.

Parses perturbation GMT files (LINCS, MoTrPAC, GTEx, etc.) into
shard-indexed JSON files that the webapp can load efficiently.

Architecture:
    1. Stream GMT line-by-line (handles millions of entries, low memory)
    2. Pair Up/Down gene lists per perturbation entry
    3. Shard gene data into ~5MB files for lazy browser loading
    4. Build a lightweight metadata file (drug list) for the dropdown
    5. Build a shard index mapping each entry to its shard file

Each database gets its own subdirectory under public/data/databases/:

    public/data/databases/
    ├── index.json                  ← global registry
    ├── LINCS/
    │   ├── meta.json               ← entry list for dropdown
    │   ├── shard_index.json        ← entry → shard mapping
    │   ├── genes_0.json
    │   ├── genes_1.json
    │   └── ...
    └── LINCS_L1000_Chemical_Perturbation_Full/
        ├── meta.json
        ├── shard_index.json
        └── genes_0.json ... genes_N.json

Supports any number of entries — tested with 5K (LINCS L1000) and
designed for 1M+ (LINCS full).

Usage:
    python python/ingest_database.py <gmt_file> [options]

    python python/ingest_database.py data/LINCS_L1000.gmt \\
        --id LINCS \\
        --name "LINCS L1000" \\
        --label-type "Drug Perturbation"

Options:
    --id            Database identifier (default: inferred from filename)
    --name          Display name (default: inferred from filename)
    --label-type    Label for the dropdown (default: "Perturbation")
    --description   Short description
    --shard-size    Target shard size in MB (default: 5)
    --up-suffix     Suffix for upregulated entries (default: " Up")
    --down-suffix   Suffix for downregulated entries (default: " Down")
    --single-dir    If set, treat all entries as unidirectional (no up/down pairing)
"""

import argparse
import glob
import json
import os
import re
import shutil
import sys
import time
from collections import OrderedDict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_DIR = os.path.join(ROOT, "public", "data", "databases")


def stream_gmt(filepath):
    """
    Stream a GMT file line-by-line, yielding (entry_name, genes) tuples.
    Handles arbitrarily large files without loading them into memory.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                print(f"  [WARN] Line {line_num}: fewer than 3 columns, skipping")
                continue
            entry_name = parts[0].strip()
            genes = [g.strip() for g in parts[2:] if g.strip()]
            yield entry_name, genes


def pair_entries(filepath, up_suffix=" Up", down_suffix=" Down", single_dir=False):
    """
    Stream GMT and pair Up/Down entries per perturbation.

    Case-insensitive suffix matching: " up", " Up", " UP" all work.
    Also matches " dn", " Dn", " DN" as down-regulation aliases.

    Returns:
        OrderedDict: { name: { "up": [...], "dn": [...] } }
        Preserves insertion order for deterministic sharding.
    """
    entries = OrderedDict()

    # Normalize suffixes for case-insensitive matching
    up_suffixes = [up_suffix.lower()]
    down_suffixes = [down_suffix.lower()]
    # Also recognize common aliases
    for s in [" up"]:
        if s not in up_suffixes:
            up_suffixes.append(s)
    for s in [" down", " dn"]:
        if s not in down_suffixes:
            down_suffixes.append(s)

    for entry_name, genes in stream_gmt(filepath):
        if single_dir:
            entries.setdefault(entry_name, {"up": [], "dn": []})
            entries[entry_name]["up"] = genes
            continue

        entry_lower = entry_name.lower()
        matched = False

        # Check up suffixes
        for suffix in up_suffixes:
            if entry_lower.endswith(suffix):
                name = entry_name[: -len(suffix)].strip()
                entries.setdefault(name, {"up": [], "dn": []})
                entries[name]["up"] = genes
                matched = True
                break

        if not matched:
            # Check down suffixes
            for suffix in down_suffixes:
                if entry_lower.endswith(suffix):
                    name = entry_name[: -len(suffix)].strip()
                    entries.setdefault(name, {"up": [], "dn": []})
                    entries[name]["dn"] = genes
                    matched = True
                    break

        if not matched:
            # No suffix — treat as unidirectional
            entries.setdefault(entry_name, {"up": [], "dn": []})
            entries[entry_name]["up"] = genes

    return entries


def cleanup_database(db_id):
    """Remove the entire subdirectory for this database (safe re-ingestion)."""
    db_subdir = os.path.join(DB_DIR, db_id)
    if os.path.isdir(db_subdir):
        shutil.rmtree(db_subdir)
        print(f"    Cleaned up old directory: {db_id}/")

    # Also clean up legacy flat files from older ingestion format
    legacy_patterns = [
        os.path.join(DB_DIR, f"{db_id}_genes_*.json"),
        os.path.join(DB_DIR, f"{db_id}_shard_index.json"),
        os.path.join(DB_DIR, f"{db_id}.json"),
    ]
    removed = 0
    for pattern in legacy_patterns:
        for fpath in glob.glob(pattern):
            os.remove(fpath)
            removed += 1
    if removed:
        print(f"    Cleaned up {removed} legacy flat files for {db_id}")


def shard_and_write(entries, db_id, target_shard_mb=5):
    """
    Write gene data to sharded JSON files inside databases/<db_id>/.

    Each shard is ~target_shard_mb MB. Returns (shard_index, num_shards).
    shard_index maps entry_name -> shard_filename (just the filename, no path).
    """
    db_subdir = os.path.join(DB_DIR, db_id)
    os.makedirs(db_subdir, exist_ok=True)

    target_bytes = target_shard_mb * 1024 * 1024

    shard_index = {}
    shard_idx = 0
    current_shard = {}
    current_size = 0
    total_entries = 0

    def flush_shard():
        nonlocal shard_idx, current_shard, current_size
        if not current_shard:
            return
        shard_file = f"genes_{shard_idx}.json"
        shard_path = os.path.join(db_subdir, shard_file)
        with open(shard_path, "w", encoding="utf-8") as f:
            json.dump(current_shard, f, separators=(",", ":"))
        file_size = os.path.getsize(shard_path)
        print(f"    Shard {shard_idx}: {len(current_shard)} entries, "
              f"{file_size / 1024 / 1024:.1f} MB ({shard_file})")
        for name in current_shard:
            shard_index[name] = shard_file
        shard_idx += 1
        current_shard = {}
        current_size = 0

    for name, gene_data in entries.items():
        entry_json_size = len(json.dumps({name: gene_data}, separators=(",", ":")))

        # If adding this entry exceeds target, flush first
        if current_size + entry_json_size > target_bytes and current_shard:
            flush_shard()

        current_shard[name] = gene_data
        current_size += entry_json_size
        total_entries += 1

    # Flush remaining
    flush_shard()

    # Write shard index inside the subdirectory
    index_path = os.path.join(db_subdir, "shard_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(shard_index, f, separators=(",", ":"))
    index_size = os.path.getsize(index_path)

    print(f"    Shard index: {index_size / 1024:.0f} KB "
          f"({total_entries} entries across {shard_idx} shards)")

    return shard_index, shard_idx


def write_metadata(entries, db_id, db_name, label_type, description):
    """
    Write the lightweight metadata file (for the dropdown) inside databases/<db_id>/.
    Contains entry names and gene counts, but NOT the gene lists themselves.
    """
    db_subdir = os.path.join(DB_DIR, db_id)
    os.makedirs(db_subdir, exist_ok=True)

    drugs = []
    for name, data in entries.items():
        drugs.append({
            "name": name,
            "up": len(data.get("up", [])),
            "dn": len(data.get("dn", [])),
        })

    meta = {
        "id": db_id,
        "name": db_name,
        "description": description or f"{db_name} perturbation signatures",
        "label_type": label_type,
        "drug_count": len(drugs),
        "drugs": drugs,
    }

    meta_path = os.path.join(db_subdir, "meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    file_size = os.path.getsize(meta_path)
    print(f"    Metadata: {file_size / 1024:.0f} KB ({len(drugs)} entries)")

    return meta_path


def update_database_index(db_id, db_name, label_type, description, entry_count, num_shards):
    """
    Add or update this database in the global index.json registry.
    """
    index_path = os.path.join(DB_DIR, "index.json")

    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            index = json.load(f)
    else:
        index = []

    # Remove existing entry with same ID
    index = [d for d in index if d["id"] != db_id]

    index.append({
        "id": db_id,
        "name": db_name,
        "description": description or f"{db_name} perturbation signatures",
        "label_type": label_type,
        "drug_count": entry_count,
        "num_shards": num_shards,
    })

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"    Database index updated: {len(index)} databases")


def infer_id_from_filename(filepath):
    """Infer a short database ID from a GMT filename."""
    basename = os.path.splitext(os.path.basename(filepath))[0]
    # Try to extract the main identifier
    if "LINCS" in basename.upper():
        return "LINCS"
    # Generic: first word before date/timestamp
    parts = basename.split("_")
    return parts[0] if parts else "DB"


def main():
    parser = argparse.ArgumentParser(
        description="Ingest a perturbation GMT file into the Mondrian Map database system."
    )
    parser.add_argument("gmt_file", help="Path to the GMT file")
    parser.add_argument("--id", help="Database identifier (e.g., LINCS)")
    parser.add_argument("--name", help="Display name (e.g., 'LINCS L1000')")
    parser.add_argument("--label-type", default="Perturbation",
                        help="Label for dropdown (e.g., 'Drug Perturbation')")
    parser.add_argument("--description", default="",
                        help="Short description")
    parser.add_argument("--shard-size", type=float, default=5,
                        help="Target shard size in MB (default: 5)")
    parser.add_argument("--up-suffix", default=" Up",
                        help="Suffix for upregulated entries (default: ' Up')")
    parser.add_argument("--down-suffix", default=" Down",
                        help="Suffix for downregulated entries (default: ' Down')")
    parser.add_argument("--single-dir", action="store_true",
                        help="Treat all entries as unidirectional (no up/down pairing)")

    args = parser.parse_args()

    gmt_path = args.gmt_file
    if not os.path.isabs(gmt_path):
        gmt_path = os.path.join(ROOT, gmt_path)

    if not os.path.exists(gmt_path):
        print(f"ERROR: GMT file not found: {gmt_path}")
        sys.exit(1)

    db_id = args.id or infer_id_from_filename(gmt_path)
    db_name = args.name or db_id
    label_type = args.label_type
    description = args.description

    print("=" * 60)
    print(f"INGESTING DATABASE: {db_name}")
    print("=" * 60)
    print(f"  GMT file: {gmt_path}")
    print(f"  ID: {db_id}")
    print(f"  Output: databases/{db_id}/")
    print(f"  Label type: {label_type}")
    print(f"  Shard size: {args.shard_size} MB")
    print()

    # Step 0: Clean up old data for this database
    print("  Step 0: Cleaning up old data...")
    cleanup_database(db_id)

    # Step 1: Parse and pair entries
    t0 = time.time()
    print("  Step 1: Parsing GMT file...")
    entries = pair_entries(
        gmt_path,
        up_suffix=args.up_suffix,
        down_suffix=args.down_suffix,
        single_dir=args.single_dir,
    )
    entry_count = len(entries)
    t1 = time.time()
    print(f"    {entry_count} unique entries parsed in {t1 - t0:.1f}s")

    # Step 2: Shard gene data
    print("  Step 2: Sharding gene data...")
    shard_index, num_shards = shard_and_write(entries, db_id, args.shard_size)

    # Step 3: Write metadata
    print("  Step 3: Writing metadata...")
    write_metadata(entries, db_id, db_name, label_type, description)

    # Step 4: Update global index
    print("  Step 4: Updating database index...")
    update_database_index(db_id, db_name, label_type, description, entry_count, num_shards)

    elapsed = time.time() - t0
    print()
    print("=" * 60)
    print(f"DONE in {elapsed:.1f}s")
    print(f"  {entry_count} entries -> {num_shards} shards")
    print(f"  Output: databases/{db_id}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
