"""
GMT File Parser for Mondrian Map Pipeline.

Parses GMT (Gene Matrix Transposed) files from LINCS and other sources.
GMT format: each line has tab-separated fields:
  - Column 1: Gene set name (e.g., "Afatinib Up")
  - Column 2: Description (often empty)
  - Column 3+: Gene symbols
"""

import re


def parse_gmt(filepath):
    """
    Parse a GMT file into a list of gene set dictionaries.

    Returns:
        list[dict]: Each dict has keys:
            - name (str): Full gene set name
            - drug (str): Drug/compound name
            - direction (str): 'up' or 'down'
            - description (str): Description field (often empty)
            - genes (list[str]): Gene symbols
    """
    gene_sets = []

    with open(filepath, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            parts = line.split("\t")
            if len(parts) < 3:
                continue

            name = parts[0].strip()
            description = parts[1].strip()
            genes = [g.strip() for g in parts[2:] if g.strip()]

            # Parse direction from name (e.g., "Afatinib Up" -> drug="Afatinib", direction="up")
            direction = "unknown"
            drug = name

            if name.lower().endswith(" up"):
                direction = "up"
                drug = name[:-3].strip()
            elif name.lower().endswith(" down"):
                direction = "down"
                drug = name[:-5].strip()
            elif name.lower().endswith(" dn"):
                direction = "down"
                drug = name[:-3].strip()

            gene_sets.append({
                "name": name,
                "drug": drug,
                "direction": direction,
                "description": description,
                "genes": genes,
            })

    return gene_sets


def get_drug_gene_sets(gmt_data, drug_name):
    """
    Extract up-regulated and down-regulated gene sets for a specific drug.

    Args:
        gmt_data: Parsed GMT data from parse_gmt()
        drug_name: Drug/compound name (case-insensitive)

    Returns:
        dict with keys:
            - up_genes (list[str]): Upregulated gene symbols
            - down_genes (list[str]): Downregulated gene symbols
            - all_genes (list[str]): Combined unique gene symbols
    """
    drug_lower = drug_name.lower()
    up_genes = []
    down_genes = []

    for gs in gmt_data:
        if gs["drug"].lower() == drug_lower:
            if gs["direction"] == "up":
                up_genes = gs["genes"]
            elif gs["direction"] == "down":
                down_genes = gs["genes"]

    all_genes = list(set(up_genes + down_genes))

    return {
        "up_genes": up_genes,
        "down_genes": down_genes,
        "all_genes": all_genes,
    }


def list_drugs(gmt_data):
    """List all unique drug/compound names in the GMT data."""
    drugs = sorted(set(gs["drug"] for gs in gmt_data))
    return drugs


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python gmt_parser.py <gmt_file> [drug_name]")
        sys.exit(1)

    filepath = sys.argv[1]
    gmt_data = parse_gmt(filepath)
    print(f"Parsed {len(gmt_data)} gene sets from {filepath}")

    drugs = list_drugs(gmt_data)
    print(f"Found {len(drugs)} unique drugs/compounds")

    if len(sys.argv) >= 3:
        drug_name = sys.argv[2]
        result = get_drug_gene_sets(gmt_data, drug_name)
        print(f"\n{drug_name}:")
        print(f"  Up genes: {len(result['up_genes'])}")
        print(f"  Down genes: {len(result['down_genes'])}")
        print(f"  Total unique: {len(result['all_genes'])}")
    else:
        print("\nFirst 10 drugs:")
        for d in drugs[:10]:
            print(f"  {d}")
