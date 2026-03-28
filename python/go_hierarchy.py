"""
GO Hierarchy Lookup Module for Mondrian Map Pipeline.

Reads asset/GO_layers.txt to map GO IDs to hierarchy levels and metadata.
"""

import os

import pandas as pd


def load_go_layers(filepath=None):
    """
    Load GO_layers.txt and return a lookup dictionary.

    Args:
        filepath: Path to GO_layers.txt. If None, tries default locations.

    Returns:
        dict: {go_id_without_prefix: {"layer": int, "level": int, "size": int, "category": str, "depth": int}}
    """
    if filepath is None:
        # Try default locations
        candidates = [
            os.path.join(os.path.dirname(__file__), "..", "public", "data", "GO_layers.csv"),
        ]
        for c in candidates:
            if os.path.exists(c):
                filepath = c
                break

    if filepath is None or not os.path.exists(filepath):
        print(f"  [WARN] GO_layers file not found")
        return {}

    # Detect separator
    ext = os.path.splitext(filepath)[1].lower()
    sep = "\t" if ext == ".txt" else ","

    try:
        df = pd.read_csv(filepath, sep=sep)
    except Exception as e:
        print(f"  [ERROR] Failed to read {filepath}: {e}")
        return {}

    lookup = {}
    for _, row in df.iterrows():
        go_id_raw = str(row.get("ID", row.get("GOID", "")))
        # Remove "GO:" prefix if present
        go_id = go_id_raw.replace("GO:", "").strip()

        if not go_id:
            continue

        lookup[go_id] = {
            "layer": int(row.get("layer", 0)),
            "level": int(row.get("level", 0)),
            "size": int(row.get("size", 0)),
            "category": str(row.get("category", "biological_process")),
            "depth": int(row.get("depth", 0)),
        }

    return lookup


def annotate_nodes_with_hierarchy(nodes, go_layers_lookup):
    """
    Add hierarchy information (layer, level) to node dicts.

    Args:
        nodes: List of node dicts with 'go_id' field
        go_layers_lookup: Dict from load_go_layers()

    Returns:
        List of nodes with added 'layer' and 'level' fields
    """
    for node in nodes:
        go_id = node["go_id"]
        info = go_layers_lookup.get(go_id, {})

        node["layer"] = info.get("layer", 0)
        node["level"] = info.get("level", 0)
        node["go_size"] = info.get("size", 0)
        node["go_category"] = info.get("category", "biological_process")
        node["go_depth"] = info.get("depth", 0)

    return nodes
