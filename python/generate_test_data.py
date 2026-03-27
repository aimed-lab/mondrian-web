"""
Generate test JSON data for Mondrian Map frontend development.

Uses simulated enrichment when Enrichr API is unavailable.
This allows frontend development to proceed with realistic data structure.
"""

import json
import os
import sys
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from gmt_parser import parse_gmt, get_drug_gene_sets
from simulate_enrichment import simulate_enrichment
from gobert_embeddings import get_gobert_embeddings
from layout import compute_layout, scale_to_canvas, calculate_block_sizes
from crosstalk import calculate_crosstalk
from go_hierarchy import load_go_layers, annotate_nodes_with_hierarchy


def assign_color(direction):
    color_map = {
        "upregulated": "#E30022",
        "downregulated": "#0078BF",
        "shared": "#FFD700",
    }
    return color_map.get(direction, "#1D1D1D")


def generate_test_json(gmt_file, drug_name, output_path, canvas_size=1000):
    """Generate test JSON from GMT file using simulated enrichment."""

    print(f"Parsing GMT file: {gmt_file}")
    gmt_data = parse_gmt(gmt_file)
    result = get_drug_gene_sets(gmt_data, drug_name)

    up_genes = result["up_genes"]
    down_genes = result["down_genes"]
    print(f"  {drug_name}: {len(up_genes)} up genes, {len(down_genes)} down genes")

    # --- Step 1: Simulated Enrichment ---
    print("\n[Step 1/6] Simulating enrichment analysis...")
    go_layers_path = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "GO_layers.csv")

    up_nodes = simulate_enrichment(up_genes, go_layers_path, direction="upregulated", seed=42)
    down_nodes = simulate_enrichment(down_genes, go_layers_path, direction="downregulated", seed=123)
    print(f"  Up: {len(up_nodes)} GO terms, Down: {len(down_nodes)} GO terms")

    # Merge and deduplicate
    all_nodes = []
    seen = {}

    for node in up_nodes + down_nodes:
        gid = node["go_id"]
        if gid in seen:
            existing = seen[gid]
            existing["direction"] = "shared"
            merged_genes = list(set(existing["genes"] + node["genes"]))
            existing["genes"] = merged_genes
            existing["gene_count"] = len(merged_genes)
            if node["significance_score"] > existing["significance_score"]:
                existing["significance_score"] = node["significance_score"]
                existing["adjusted_p_value"] = node["adjusted_p_value"]
        else:
            seen[gid] = node
            all_nodes.append(node)

    print(f"  Total unique GO terms: {len(all_nodes)}")

    # --- Step 2: GO Hierarchy ---
    print("\n[Step 2/6] Looking up GO hierarchy...")
    go_layers = load_go_layers(go_layers_path)
    all_nodes = annotate_nodes_with_hierarchy(all_nodes, go_layers)

    # --- Step 3: Embeddings ---
    print("\n[Step 3/6] Computing embeddings (hash-based fallback)...")
    go_ids = [node["go_id"] for node in all_nodes]
    embeddings = get_gobert_embeddings(go_ids, mode="fallback")
    print(f"  Embeddings for {len(embeddings)} GO terms")

    # --- Step 4: Layout ---
    print("\n[Step 4/6] Computing 2D layout (MDS)...")
    coords = compute_layout(embeddings, mode="mds")
    canvas_coords = scale_to_canvas(coords, canvas_size, canvas_size)

    # --- Step 5: Sizes & Colors ---
    print("\n[Step 5/6] Computing block sizes and colors...")
    all_nodes = calculate_block_sizes(all_nodes)

    for node in all_nodes:
        gid = node["go_id"]
        node["continuous_coords"] = coords.get(gid, {"x": 0.0, "y": 0.0})

        cx = canvas_coords.get(gid, {}).get("x", canvas_size // 2)
        cy = canvas_coords.get(gid, {}).get("y", canvas_size // 2)
        node["grid_coords"] = {
            "x": cx, "y": cy,
            "w": node.get("block_w", 20),
            "h": node.get("block_h", 20),
        }
        node["color"] = assign_color(node["direction"])

    # --- Step 6: Crosstalk ---
    print("\n[Step 6/6] Calculating crosstalk edges...")
    edges = calculate_crosstalk(all_nodes, jaccard_threshold=0.10)
    print(f"  Found {len(edges)} edges")

    # --- Build Output ---
    output_nodes = []
    for node in all_nodes:
        output_nodes.append({
            "go_id": node["go_id"],
            "name": node["name"],
            "direction": node["direction"],
            "significance_score": node["significance_score"],
            "adjusted_p_value": node["adjusted_p_value"],
            "gene_count": node["gene_count"],
            "genes": node["genes"],
            "continuous_coords": node["continuous_coords"],
            "grid_coords": node["grid_coords"],
            "layer": node.get("layer", 0),
            "level": node.get("level", 0),
            "color": node["color"],
        })

    output_edges = []
    for edge in edges:
        output_edges.append({
            "source": edge["source"],
            "target": edge["target"],
            "weight": edge["weight"],
            "type": edge["type"],
        })

    output = {
        "metadata": {
            "case_study": f"LINCS_{drug_name}",
            "tissue_or_cell": "Cell Lines (L1000)",
            "contrast": f"{drug_name}_vs_Control",
            "input_gene_count": len(set(up_genes + down_genes)),
            "up_gene_count": len(up_genes),
            "down_gene_count": len(down_genes),
            "enriched_go_terms": len(output_nodes),
            "total_edges": len(output_edges),
            "enrichment_library": "GO_Biological_Process_2023",
            "enrichment_cutoff": 0.05,
            "jaccard_threshold": 0.10,
            "canvas_size": {"width": canvas_size, "height": canvas_size},
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "note": "Generated with simulated enrichment for testing"
        },
        "nodes": output_nodes,
        "edges": output_edges,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"Output: {output_path}")
    print(f"  Nodes: {len(output_nodes)}")
    print(f"  Edges: {len(output_edges)}")

    # Summary by direction
    dirs = {}
    for n in output_nodes:
        d = n["direction"]
        dirs[d] = dirs.get(d, 0) + 1
    for d, c in dirs.items():
        print(f"  {d}: {c}")

    # Summary by layer
    layers = {}
    for n in output_nodes:
        l = n.get("layer", 0)
        layers[l] = layers.get(l, 0) + 1
    print(f"  Layers: {dict(sorted(layers.items()))}")

    return output


if __name__ == "__main__":
    gmt_file = os.path.join(os.path.dirname(__file__), "..", "data",
                            "LINCS_XMT_2022-12-13_LINCS_L1000_Chem_Pert_Consensus_Sigs.gmt")
    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "afatinib_layout.json")

    generate_test_json(gmt_file, "Afatinib", output_path)
