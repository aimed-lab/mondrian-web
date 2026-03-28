"""
Mondrian Map — Offline Lookup Table Generator.

Generates pre-computed lookup tables so the webapp can run without a backend:

1. GoBERT Embeddings + UMAP 2D projections for all GO terms in GO_layers.csv
2. Parsed geneset library JSON files from GMT files in asset/geneset_lib/

Usage (from mmweb root, with venv activated):
    python python/generate_lookup_tables.py

Incremental mode:
    If .embeddings_cache.npz already exists, only new GO terms from GO_layers.csv
    are embedded and appended, then UMAP is re-run on the full set.

Output:
    public/data/go_embeddings_umap.csv   — GO_ID, x, y (UMAP 2D coords)
    public/data/libraries/<name>.json    — parsed geneset libraries
    public/data/library_index.json       — list of available libraries with metadata
"""

import csv
import json
import os
import re
import sys
import time

import numpy as np
import pandas as pd

# Ensure sibling modules are importable
sys.path.insert(0, os.path.dirname(__file__))

from gobert_embeddings import get_gobert_embeddings

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GO_LAYERS_CSV = os.path.join(ROOT, "public", "data", "GO_layers.csv")
GENESET_LIB_DIR = os.path.join(ROOT, "asset", "geneset_lib")
OUTPUT_DIR = os.path.join(ROOT, "public", "data")
LIBRARIES_DIR = os.path.join(OUTPUT_DIR, "libraries")
EMBEDDINGS_CACHE = os.path.join(ROOT, "python", ".embeddings_cache.npz")
UMAP_OUTPUT = os.path.join(OUTPUT_DIR, "go_embeddings_umap.csv")
LIBRARY_INDEX = os.path.join(OUTPUT_DIR, "library_index.json")


def ensure_dirs():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(LIBRARIES_DIR, exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════
# Part 1: GoBERT Embeddings + UMAP
# ═══════════════════════════════════════════════════════════════════════════

def load_go_ids_from_csv():
    """Load all GO IDs from GO_layers.csv."""
    df = pd.read_csv(GO_LAYERS_CSV)
    go_ids = df["ID"].astype(str).str.replace("GO:", "", regex=False).str.strip().tolist()
    return sorted(set(go_ids))


def load_cached_embeddings():
    """Load previously computed embeddings from cache."""
    if not os.path.exists(EMBEDDINGS_CACHE):
        return {}
    data = np.load(EMBEDDINGS_CACHE, allow_pickle=True)
    go_ids = data["go_ids"].tolist()
    matrix = data["embeddings"]
    return {gid: matrix[i] for i, gid in enumerate(go_ids)}


def save_cached_embeddings(embeddings_dict):
    """Save embeddings to cache for incremental updates."""
    go_ids = sorted(embeddings_dict.keys())

    # Normalize all values to flat float32 arrays
    dims_seen = {}
    for gid in go_ids:
        v = embeddings_dict[gid]
        if hasattr(v, 'numpy'):
            v = v.numpy()
        v = np.asarray(v, dtype=np.float32).flatten()
        embeddings_dict[gid] = v
        d = v.shape[0]
        dims_seen[d] = dims_seen.get(d, 0) + 1

    if len(dims_seen) > 1:
        print(f"  [WARN] Mixed embedding dimensions detected: {dims_seen}")
        target_dim = max(dims_seen, key=dims_seen.get)
        print(f"  [WARN] Normalizing all to dim={target_dim} (padding/truncating)")
        for gid in go_ids:
            v = embeddings_dict[gid]
            if v.shape[0] < target_dim:
                embeddings_dict[gid] = np.pad(v, (0, target_dim - v.shape[0]))
            elif v.shape[0] > target_dim:
                embeddings_dict[gid] = v[:target_dim]

    matrix = np.stack([embeddings_dict[gid] for gid in go_ids])
    print(f"  Saving cache: {matrix.shape[0]} embeddings x {matrix.shape[1]} dims")
    np.savez_compressed(EMBEDDINGS_CACHE, go_ids=np.array(go_ids), embeddings=matrix)


def compute_umap_2d(embeddings_dict, n_neighbors=15, min_dist=0.1, random_state=42):
    """Run UMAP on all embeddings to get 2D coordinates."""
    import umap

    go_ids = sorted(embeddings_dict.keys())
    matrix = np.stack([np.asarray(embeddings_dict[gid], dtype=np.float32).flatten()
                       for gid in go_ids])

    effective_neighbors = min(n_neighbors, len(go_ids) - 1)
    effective_neighbors = max(2, effective_neighbors)

    print(f"  Running UMAP on {len(go_ids)} GO terms ({matrix.shape[1]}-dim, "
          f"n_neighbors={effective_neighbors})...")
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=effective_neighbors,
        min_dist=min_dist,
        metric="cosine",
        random_state=random_state,
    )
    coords_2d = reducer.fit_transform(matrix)

    # Normalize to [-1, 1]
    mins = coords_2d.min(axis=0)
    maxs = coords_2d.max(axis=0)
    ranges = np.maximum(maxs - mins, 1e-10)
    coords_norm = 2 * (coords_2d - mins) / ranges - 1

    result = {}
    for i, gid in enumerate(go_ids):
        result[gid] = (float(coords_norm[i, 0]), float(coords_norm[i, 1]))

    return result


def save_umap_csv(coords_dict):
    """Save UMAP coordinates as CSV: GO_ID, x, y"""
    with open(UMAP_OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["GO_ID", "x", "y"])
        for go_id in sorted(coords_dict.keys()):
            x, y = coords_dict[go_id]
            writer.writerow([f"GO:{go_id}", round(x, 6), round(y, 6)])


def generate_embeddings_and_umap():
    """Main entry: incremental GoBERT embedding + full UMAP recompute."""
    print("=" * 60)
    print("STEP 1: GoBERT Embeddings + UMAP Projection")
    print("=" * 60)

    all_go_ids = load_go_ids_from_csv()
    print(f"  GO_layers.csv contains {len(all_go_ids)} unique GO terms")

    # Load cache
    cached = load_cached_embeddings()
    cached_ids = set(cached.keys())
    all_ids_set = set(all_go_ids)

    new_ids = sorted(all_ids_set - cached_ids)
    removed_ids = cached_ids - all_ids_set

    if removed_ids:
        print(f"  Removing {len(removed_ids)} stale GO terms from cache")
        for gid in removed_ids:
            del cached[gid]

    if new_ids:
        print(f"  Computing embeddings for {len(new_ids)} new GO terms...")
        # Uses gobert_embeddings.py — single source of truth for embedding logic
        new_embeddings = get_gobert_embeddings(new_ids, mode="auto")

        # Diagnostic: check shapes
        shapes = {}
        for gid, v in new_embeddings.items():
            arr = np.asarray(v, dtype=np.float32).flatten()
            shapes[arr.shape[0]] = shapes.get(arr.shape[0], 0) + 1
        print(f"  Embedding dimensions: {shapes}")

        cached.update(new_embeddings)
        save_cached_embeddings(cached)
        print(f"  Cache updated: {len(cached)} total embeddings")
    else:
        print(f"  All {len(cached)} GO terms already in cache — skipping embedding")

    # Filter to only IDs in current GO_layers.csv
    active_embeddings = {gid: cached[gid] for gid in all_go_ids if gid in cached}

    # UMAP (always recompute — it's fast and depends on the full manifold)
    coords = compute_umap_2d(active_embeddings)
    save_umap_csv(coords)
    print(f"  Saved UMAP coordinates to {UMAP_OUTPUT}")
    print(f"  {len(coords)} GO terms with (x, y) projections")
    print()


# ═══════════════════════════════════════════════════════════════════════════
# Part 2: Geneset Library Parsing
# ═══════════════════════════════════════════════════════════════════════════

def parse_gmt_to_json(filepath):
    """
    Parse an Enrichr-style GMT file into a JSON-serializable dict.

    Returns:
        dict with keys:
            - name: library display name
            - terms: list of {term, go_id, genes} dicts
            - gene_universe: sorted list of all unique genes
            - term_count: number of terms
    """
    terms = []
    all_genes = set()

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                continue

            term_name = parts[0].strip()
            genes = [g.strip() for g in parts[2:] if g.strip()]

            # Extract GO ID if present
            go_match = re.search(r"\(GO:(\d+)\)", term_name)
            go_id = go_match.group(1) if go_match else None
            clean_name = re.sub(r"\s*\(GO:\d+\)\s*", "", term_name).strip()

            # Extract category tag if present (BP, CC, MF)
            category = None
            cat_match = re.search(r"\b(BP|CC|MF)\b", term_name)
            if cat_match:
                cat_map = {"BP": "biological_process", "CC": "cellular_component", "MF": "molecular_function"}
                category = cat_map.get(cat_match.group(1))

            all_genes.update(genes)
            terms.append({
                "term": clean_name,
                "go_id": go_id,
                "genes": genes,
                **({"category": category} if category else {}),
            })

    lib_name = os.path.splitext(os.path.basename(filepath))[0]

    return {
        "name": lib_name,
        "terms": terms,
        "gene_universe": sorted(all_genes),
        "term_count": len(terms),
        "gene_count": len(all_genes),
    }


def infer_library_metadata(filename):
    """Infer display name, ontology, and year from filename."""
    name = os.path.splitext(filename)[0]

    ontology = "Gene Ontology"
    if "Biological_Process" in name:
        ontology = "GO Biological Process"
    elif "Cellular_Component" in name:
        ontology = "GO Cellular Component"
    elif "Molecular_Function" in name:
        ontology = "GO Molecular Function"
    elif "SynGO" in name:
        ontology = "SynGO"

    year_match = re.search(r"(\d{4})", name)
    year = int(year_match.group(1)) if year_match else None

    display = name.replace("_", " ")

    return {
        "id": name,
        "display_name": display,
        "ontology": ontology,
        "year": year,
        "filename": f"{name}.json",
    }


def generate_library_lookups():
    """Parse all GMT files in asset/geneset_lib/ and save as JSON."""
    print("=" * 60)
    print("STEP 2: Geneset Library Parsing")
    print("=" * 60)

    if not os.path.isdir(GENESET_LIB_DIR):
        print(f"  [WARN] Directory not found: {GENESET_LIB_DIR}")
        return

    gmt_files = sorted([f for f in os.listdir(GENESET_LIB_DIR) if f.endswith(".txt")])
    print(f"  Found {len(gmt_files)} GMT files")

    index = []

    for gmt_file in gmt_files:
        filepath = os.path.join(GENESET_LIB_DIR, gmt_file)
        lib_data = parse_gmt_to_json(filepath)
        meta = infer_library_metadata(gmt_file)

        out_path = os.path.join(LIBRARIES_DIR, f"{meta['id']}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(lib_data, f, ensure_ascii=False)

        file_size_kb = os.path.getsize(out_path) / 1024
        print(f"    {meta['id']}: {lib_data['term_count']} terms, "
              f"{lib_data['gene_count']} genes -> {file_size_kb:.0f} KB")

        index.append({
            **meta,
            "term_count": lib_data["term_count"],
            "gene_count": lib_data["gene_count"],
        })

    with open(LIBRARY_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"\n  Saved library index to {LIBRARY_INDEX}")
    print(f"  {len(index)} libraries indexed")
    print()


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main():
    ensure_dirs()

    t0 = time.time()
    generate_embeddings_and_umap()
    generate_library_lookups()

    elapsed = time.time() - t0
    print("=" * 60)
    print(f"ALL LOOKUP TABLES GENERATED in {elapsed:.1f}s")
    print("=" * 60)
    print(f"  {UMAP_OUTPUT}")
    print(f"  {LIBRARY_INDEX}")
    print(f"  {LIBRARIES_DIR}/")


if __name__ == "__main__":
    main()
