"""
Mondrian Map - Full Data Processing Pipeline Orchestrator.

Usage:
  python process_pipeline.py --gmt <gmt_file> --drug <drug_name> --output <output.json>
  python process_pipeline.py --genes <genes.csv> --direction up --output <output.json>

Pipeline:
  GeneSet (Input) → Enrichment → GO Terms → GoBERT Embeddings → UMAP → Canvas Mapping → JSON Output
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from gmt_parser import parse_gmt, get_drug_gene_sets, list_drugs
from enrichment import run_enrichment, parse_enrichment_results
from gobert_embeddings import get_gobert_embeddings
from layout import compute_layout, scale_to_canvas, calculate_block_sizes
from crosstalk import calculate_crosstalk
from go_hierarchy import load_go_layers, annotate_nodes_with_hierarchy


def assign_color(direction):
    """Assign Mondrian color based on biological direction."""
    color_map = {
        "upregulated": "#E30022",   # Red
        "downregulated": "#0078BF", # Blue
        "shared": "#FFD700",        # Yellow
    }
    return color_map.get(direction, "#1D1D1D")  # Black for unknown


def run_pipeline(
    up_genes=None,
    down_genes=None,
    case_study="",
    tissue_or_cell="",
    contrast="",
    enrichment_library="GO_Biological_Process_2023",
    enrichment_cutoff=0.05,
    jaccard_threshold=0.15,
    canvas_width=1000,
    canvas_height=1000,
    enrichment_mode="auto",
    embedding_mode="auto",
    layout_mode="auto",
):
    """
    Execute the full Mondrian Map data processing pipeline.

    Args:
        up_genes: List of upregulated gene symbols
        down_genes: List of downregulated gene symbols
        case_study: Descriptive name for the case study
        tissue_or_cell: Tissue or cell type
        contrast: Condition comparison (e.g., "Drug vs Control")
        enrichment_library: Enrichr library name
        enrichment_cutoff: Adjusted p-value cutoff
        jaccard_threshold: Minimum Jaccard Index for edges
        canvas_width/height: Canvas dimensions
        enrichment_mode: 'gseapy', 'rest', or 'auto'
        embedding_mode: 'full', 'fallback', or 'auto'
        layout_mode: 'umap', 'mds', or 'auto'

    Returns:
        dict: Complete Mondrian Map layout JSON
    """
    up_genes = up_genes or []
    down_genes = down_genes or []

    print("=" * 60)
    print("MONDRIAN MAP DATA PROCESSING PIPELINE")
    print("=" * 60)
    print(f"  Case Study: {case_study}")
    print(f"  Up genes: {len(up_genes)}")
    print(f"  Down genes: {len(down_genes)}")
    print()

    # --- Step 1: Enrichment Analysis ---
    print("[Step 1/6] Running enrichment analysis...")
    all_nodes = []

    if up_genes and len(up_genes) >= 5:
        print(f"  Enriching {len(up_genes)} upregulated genes...")
        up_df = run_enrichment(up_genes, enrichment_library, enrichment_cutoff, mode=enrichment_mode)
        if not up_df.empty:
            up_nodes = parse_enrichment_results(up_df, direction="upregulated")
            print(f"  Found {len(up_nodes)} significant GO terms (upregulated)")
            all_nodes.extend(up_nodes)
        else:
            print("  No significant enrichment for upregulated genes")

    if down_genes and len(down_genes) >= 5:
        print(f"  Enriching {len(down_genes)} downregulated genes...")
        down_df = run_enrichment(down_genes, enrichment_library, enrichment_cutoff, mode=enrichment_mode)
        if not down_df.empty:
            down_nodes = parse_enrichment_results(down_df, direction="downregulated")
            print(f"  Found {len(down_nodes)} significant GO terms (downregulated)")
            all_nodes.extend(down_nodes)
        else:
            print("  No significant enrichment for downregulated genes")

    if not all_nodes:
        print("  [ERROR] No significant GO terms found. Exiting.")
        return None

    # Deduplicate: if same GO term appears in both up and down, mark as "shared"
    seen = {}
    deduped_nodes = []
    for node in all_nodes:
        gid = node["go_id"]
        if gid in seen:
            # Mark as shared - this GO term is enriched in both directions
            existing = seen[gid]
            existing["direction"] = "shared"
            # Merge gene lists
            merged_genes = list(set(existing["genes"] + node["genes"]))
            existing["genes"] = merged_genes
            existing["gene_count"] = len(merged_genes)
            # Use the more significant p-value
            if node["significance_score"] > existing["significance_score"]:
                existing["significance_score"] = node["significance_score"]
                existing["adjusted_p_value"] = node["adjusted_p_value"]
        else:
            seen[gid] = node
            deduped_nodes.append(node)

    all_nodes = deduped_nodes
    print(f"  Total unique GO terms: {len(all_nodes)}")

    # --- Step 2: GO Hierarchy Lookup ---
    print("\n[Step 2/6] Looking up GO hierarchy...")
    go_layers_path = os.path.join(os.path.dirname(__file__), "..", "public", "data", "GO_layers.csv")
    go_layers = load_go_layers(go_layers_path)
    all_nodes = annotate_nodes_with_hierarchy(all_nodes, go_layers)
    layers_found = set(n["layer"] for n in all_nodes if n["layer"] > 0)
    print(f"  GO terms mapped to layers: {len([n for n in all_nodes if n['layer'] > 0])}/{len(all_nodes)}")
    print(f"  Layers represented: {sorted(layers_found) if layers_found else 'none'}")

    # --- Step 3: GoBERT Embeddings ---
    print("\n[Step 3/6] Computing embeddings...")
    go_ids = [node["go_id"] for node in all_nodes]
    embeddings = get_gobert_embeddings(go_ids, mode=embedding_mode)
    print(f"  Embeddings computed for {len(embeddings)} GO terms")

    # --- Step 4: Dimensionality Reduction (UMAP/MDS) ---
    print("\n[Step 4/6] Computing 2D layout...")
    coords = compute_layout(embeddings, mode=layout_mode)
    canvas_coords = scale_to_canvas(coords, canvas_width, canvas_height)
    print(f"  Layout computed for {len(canvas_coords)} terms")

    # --- Step 5: Block Sizes ---
    print("\n[Step 5/6] Calculating block sizes and colors...")
    all_nodes = calculate_block_sizes(all_nodes)

    # Assign coordinates and colors
    for node in all_nodes:
        gid = node["go_id"]

        # Continuous (UMAP/MDS) coordinates
        if gid in coords:
            node["continuous_coords"] = coords[gid]
        else:
            node["continuous_coords"] = {"x": 0.0, "y": 0.0}

        # Canvas grid coordinates
        if gid in canvas_coords:
            cx = canvas_coords[gid]["x"]
            cy = canvas_coords[gid]["y"]
        else:
            cx, cy = canvas_width // 2, canvas_height // 2

        node["grid_coords"] = {
            "x": cx,
            "y": cy,
            "w": node.get("block_w", 20),
            "h": node.get("block_h", 20),
        }

        # Color
        node["color"] = assign_color(node["direction"])

    # --- Step 6: Crosstalk Edges ---
    print("\n[Step 6/6] Calculating crosstalk edges...")
    edges = calculate_crosstalk(all_nodes, jaccard_threshold)
    print(f"  Found {len(edges)} edges (Jaccard >= {jaccard_threshold})")

    # --- Build Output ---
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)

    # Count directions
    dir_counts = {}
    for n in all_nodes:
        d = n["direction"]
        dir_counts[d] = dir_counts.get(d, 0) + 1
    print(f"  Nodes: {len(all_nodes)} ({', '.join(f'{v} {k}' for k, v in dir_counts.items())})")
    print(f"  Edges: {len(edges)}")
    print(f"  Layers: {sorted(layers_found) if layers_found else 'none'}")

    # Clean up internal fields before output
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
            "case_study": case_study,
            "tissue_or_cell": tissue_or_cell,
            "contrast": contrast,
            "input_gene_count": len(set(up_genes + down_genes)),
            "up_gene_count": len(up_genes),
            "down_gene_count": len(down_genes),
            "enriched_go_terms": len(output_nodes),
            "total_edges": len(output_edges),
            "enrichment_library": enrichment_library,
            "enrichment_cutoff": enrichment_cutoff,
            "jaccard_threshold": jaccard_threshold,
            "canvas_size": {"width": canvas_width, "height": canvas_height},
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "nodes": output_nodes,
        "edges": output_edges,
    }

    return output


def main():
    parser = argparse.ArgumentParser(description="Mondrian Map Data Processing Pipeline")

    # Input options
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--gmt", help="Path to GMT file")
    input_group.add_argument("--genes", help="Path to CSV file with gene symbols")

    parser.add_argument("--drug", help="Drug name (required with --gmt)")
    parser.add_argument("--direction", default="up", choices=["up", "down", "both"],
                        help="Gene direction (for --genes input)")

    # Metadata
    parser.add_argument("--case-study", default="", help="Case study name")
    parser.add_argument("--tissue", default="", help="Tissue or cell type")
    parser.add_argument("--contrast", default="", help="Condition contrast")

    # Pipeline parameters
    parser.add_argument("--library", default="GO_Biological_Process_2023", help="Enrichr library")
    parser.add_argument("--cutoff", type=float, default=0.05, help="Adjusted p-value cutoff")
    parser.add_argument("--jaccard", type=float, default=0.15, help="Jaccard threshold for edges")
    parser.add_argument("--canvas-size", type=int, default=1000, help="Canvas width and height")

    # Mode options
    parser.add_argument("--enrichment-mode", default="auto", choices=["auto", "gseapy", "rest"])
    parser.add_argument("--embedding-mode", default="auto", choices=["auto", "full", "fallback"])
    parser.add_argument("--layout-mode", default="auto", choices=["auto", "umap", "mds"])

    # Output
    parser.add_argument("--output", "-o", default="mondrian_layout.json", help="Output JSON file")

    args = parser.parse_args()

    # Parse input
    up_genes = []
    down_genes = []

    if args.gmt:
        if not args.drug:
            print("ERROR: --drug is required when using --gmt input")
            sys.exit(1)

        print(f"Parsing GMT file: {args.gmt}")
        gmt_data = parse_gmt(args.gmt)
        result = get_drug_gene_sets(gmt_data, args.drug)
        up_genes = result["up_genes"]
        down_genes = result["down_genes"]

        if not args.case_study:
            args.case_study = f"LINCS_{args.drug}"
        if not args.contrast:
            args.contrast = f"{args.drug}_vs_Control"

    elif args.genes:
        df = pd.read_csv(args.genes)
        gene_col = df.columns[0]
        genes = df[gene_col].dropna().astype(str).tolist()

        if args.direction == "up":
            up_genes = genes
        elif args.direction == "down":
            down_genes = genes
        else:
            up_genes = genes
            down_genes = genes

    # Run pipeline
    output = run_pipeline(
        up_genes=up_genes,
        down_genes=down_genes,
        case_study=args.case_study,
        tissue_or_cell=args.tissue,
        contrast=args.contrast,
        enrichment_library=args.library,
        enrichment_cutoff=args.cutoff,
        jaccard_threshold=args.jaccard,
        canvas_width=args.canvas_size,
        canvas_height=args.canvas_size,
        enrichment_mode=args.enrichment_mode,
        embedding_mode=args.embedding_mode,
        layout_mode=args.layout_mode,
    )

    if output is None:
        print("\nPipeline failed - no output generated.")
        sys.exit(1)

    # Write output
    output_path = args.output
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nOutput written to: {output_path}")
    print(f"  Nodes: {len(output['nodes'])}")
    print(f"  Edges: {len(output['edges'])}")


if __name__ == "__main__":
    main()
