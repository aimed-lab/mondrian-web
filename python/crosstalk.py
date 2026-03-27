"""
Crosstalk/Edge Calculation Module for Mondrian Map Pipeline.

Calculates edges between GO terms based on Jaccard Index of shared genes.
"""


def calculate_jaccard(genes_a, genes_b):
    """Calculate Jaccard Index between two gene sets."""
    set_a = set(genes_a)
    set_b = set(genes_b)

    intersection = len(set_a & set_b)
    union = len(set_a | set_b)

    if union == 0:
        return 0.0

    return intersection / union


def calculate_crosstalk(nodes, jaccard_threshold=0.15):
    """
    Calculate crosstalk edges between GO terms based on gene overlap.

    Args:
        nodes: List of node dicts with 'go_id' and 'genes' fields
        jaccard_threshold: Minimum Jaccard Index to create an edge

    Returns:
        list[dict]: Edges with source, target, weight, shared_genes, type
    """
    edges = []
    n = len(nodes)

    for i in range(n):
        for j in range(i + 1, n):
            genes_a = nodes[i].get("genes", [])
            genes_b = nodes[j].get("genes", [])

            if not genes_a or not genes_b:
                continue

            jaccard = calculate_jaccard(genes_a, genes_b)

            if jaccard >= jaccard_threshold:
                shared = list(set(genes_a) & set(genes_b))
                edges.append({
                    "source": nodes[i]["go_id"],
                    "target": nodes[j]["go_id"],
                    "weight": round(jaccard, 4),
                    "shared_genes": shared,
                    "shared_gene_count": len(shared),
                    "type": "gene_overlap",
                })

    # Sort by weight descending
    edges.sort(key=lambda e: e["weight"], reverse=True)

    return edges
