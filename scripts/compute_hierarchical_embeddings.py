#!/usr/bin/env python3
"""
Compute hierarchical embeddings for GO terms that preserve parent-child locality.

When zooming from layer N to layer N-1 (zooming in), children appear near their
parents. This gives a Google Maps-like experience where zooming in reveals detail
in the same spatial neighborhood.

Algorithm:
1. Parse go.json for is_a (parent-child) relationships
2. Load GO_layers.csv for layer assignments
3. Load existing UMAP embeddings as seed positions for highest layer
4. For each layer from highest down to 1:
   - Terms at this layer inherit positions from their nearest ancestor
     in a higher layer, plus a small offset
5. Output new go_embeddings_hierarchical.csv
"""

import json
import csv
import math
import random
import os
from collections import defaultdict

random.seed(42)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

GO_JSON = os.path.join(PROJECT_DIR, "my_asset", "go.json")
GO_LAYERS_CSV = os.path.join(PROJECT_DIR, "public", "data", "GO_layers.csv")
UMAP_CSV = os.path.join(PROJECT_DIR, "public", "data", "go_embeddings_umap.csv")
OUTPUT_CSV = os.path.join(PROJECT_DIR, "public", "data", "go_embeddings_hierarchical.csv")


def parse_go_id(uri):
    """Extract GO:NNNNNNN numeric part from URI or ID string."""
    s = uri.split("/")[-1].replace("GO_", "").replace("GO:", "")
    # Ensure it's numeric
    if s.isdigit():
        return s.zfill(7)
    return None


def load_go_hierarchy(go_json_path):
    """Parse go.json and build child -> set(parents) mapping from is_a edges."""
    print(f"Loading GO hierarchy from {go_json_path}...")
    with open(go_json_path) as f:
        data = json.load(f)

    edges = data["graphs"][0]["edges"]
    child_to_parents = defaultdict(set)
    parent_to_children = defaultdict(set)

    for edge in edges:
        if edge["pred"] != "is_a":
            continue
        child_id = parse_go_id(edge["sub"])
        parent_id = parse_go_id(edge["obj"])
        if child_id and parent_id:
            child_to_parents[child_id].add(parent_id)
            parent_to_children[parent_id].add(child_id)

    print(f"  Loaded {sum(len(v) for v in child_to_parents.values())} is_a relationships")
    print(f"  {len(child_to_parents)} children, {len(parent_to_children)} parents")
    return child_to_parents, parent_to_children


def load_go_layers(csv_path):
    """Load GO_layers.csv -> dict of go_id -> {layer, ...}"""
    print(f"Loading GO layers from {csv_path}...")
    layers = {}
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            go_id = row["ID"].replace("GO:", "").strip().zfill(7)
            layers[go_id] = int(row["layer"])
    print(f"  {len(layers)} terms with layer assignments")
    return layers


def load_existing_umap(csv_path):
    """Load existing UMAP embeddings as seed positions."""
    print(f"Loading existing UMAP embeddings from {csv_path}...")
    coords = {}
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            go_id = row["GO_ID"].replace("GO:", "").strip().zfill(7)
            coords[go_id] = (float(row["x"]), float(row["y"]))
    print(f"  {len(coords)} terms with UMAP coords")
    return coords


def find_nearest_ancestor_at_layer(go_id, target_layer, child_to_parents, go_layers, visited=None):
    """
    BFS up the hierarchy to find the nearest ancestor(s) at the given layer.
    Returns a list of ancestor IDs at that layer.
    """
    if visited is None:
        visited = set()
    if go_id in visited:
        return []
    visited.add(go_id)

    results = []
    parents = child_to_parents.get(go_id, set())
    for p in parents:
        p_layer = go_layers.get(p, 0)
        if p_layer == target_layer:
            results.append(p)
        elif p_layer > 0 and p_layer < target_layer:
            # This parent is at a layer between our term and target — keep searching
            results.extend(
                find_nearest_ancestor_at_layer(p, target_layer, child_to_parents, go_layers, visited)
            )
        elif p_layer == 0:
            # Unknown layer, keep searching
            results.extend(
                find_nearest_ancestor_at_layer(p, target_layer, child_to_parents, go_layers, visited)
            )
    return results


def find_ancestor_at_higher_layer(go_id, current_layer, child_to_parents, go_layers, max_search=5):
    """
    Find the nearest ancestor at any layer higher than current_layer.
    Searches up to max_search layers above.
    """
    for target_layer in range(current_layer + 1, current_layer + max_search + 1):
        ancestors = find_nearest_ancestor_at_layer(go_id, target_layer, child_to_parents, go_layers)
        if ancestors:
            return ancestors, target_layer
    return [], None


def compute_hierarchical_embeddings():
    """Main computation."""
    child_to_parents, parent_to_children = load_go_hierarchy(GO_JSON)
    go_layers = load_go_layers(GO_LAYERS_CSV)
    existing_umap = load_existing_umap(UMAP_CSV)

    # Group terms by layer
    terms_by_layer = defaultdict(list)
    for go_id, layer in go_layers.items():
        terms_by_layer[layer].append(go_id)

    max_layer = max(terms_by_layer.keys())
    print(f"\nMax layer: {max_layer}")
    for l in sorted(terms_by_layer.keys()):
        print(f"  Layer {l}: {len(terms_by_layer[l])} terms")

    # Final coordinates
    final_coords = {}

    # Step 1: Seed the highest layer with existing UMAP coordinates
    # These are our "continent" positions
    print(f"\nStep 1: Seeding layer {max_layer} with UMAP positions...")
    for go_id in terms_by_layer[max_layer]:
        if go_id in existing_umap:
            final_coords[go_id] = existing_umap[go_id]
        else:
            # Fallback: hash-based position
            h = hash(go_id) & 0xFFFFFFFF
            x = ((h & 0xFFFF) / 0xFFFF) * 2 - 1
            y = (((h >> 16) & 0xFFFF) / 0xFFFF) * 2 - 1
            final_coords[go_id] = (x, y)
    print(f"  Placed {len(final_coords)} terms at layer {max_layer}")

    # Step 2: For each layer from max-1 down to 1, position children near parents
    for layer in range(max_layer - 1, 0, -1):
        print(f"\nStep 2: Placing layer {layer} ({len(terms_by_layer[layer])} terms)...")
        placed = 0
        orphaned = 0

        for go_id in terms_by_layer[layer]:
            # Find ancestors that are already placed (in higher layers)
            ancestors, anc_layer = find_ancestor_at_higher_layer(
                go_id, layer, child_to_parents, go_layers
            )

            # Filter to ancestors that have coords
            placed_ancestors = [a for a in ancestors if a in final_coords]

            if placed_ancestors:
                # Average the positions of placed ancestors
                avg_x = sum(final_coords[a][0] for a in placed_ancestors) / len(placed_ancestors)
                avg_y = sum(final_coords[a][1] for a in placed_ancestors) / len(placed_ancestors)

                # Add offset based on how far apart the layers are
                # Smaller offset for adjacent layers, larger for distant ones
                layer_dist = (anc_layer or (layer + 1)) - layer
                spread = 0.03 * layer_dist  # Base spread

                # Use hash for deterministic but varied offset
                h = hash(f"{go_id}_{layer}") & 0xFFFFFFFF
                angle = (h & 0xFFFF) / 0xFFFF * 2 * math.pi
                radius = spread * (0.5 + 0.5 * ((h >> 16) & 0xFFFF) / 0xFFFF)

                x = avg_x + radius * math.cos(angle)
                y = avg_y + radius * math.sin(angle)

                # Clamp to [-1, 1]
                x = max(-0.99, min(0.99, x))
                y = max(-0.99, min(0.99, y))

                final_coords[go_id] = (x, y)
                placed += 1
            else:
                # No ancestors found — use existing UMAP or hash fallback
                if go_id in existing_umap:
                    final_coords[go_id] = existing_umap[go_id]
                else:
                    h = hash(go_id) & 0xFFFFFFFF
                    x = ((h & 0xFFFF) / 0xFFFF) * 2 - 1
                    y = (((h >> 16) & 0xFFFF) / 0xFFFF) * 2 - 1
                    final_coords[go_id] = (x, y)
                orphaned += 1

        print(f"  Placed {placed} near ancestors, {orphaned} orphaned (used fallback)")

    # Step 3: Also place any terms in existing UMAP that aren't in GO_layers
    # (they'll go to layer 0 effectively)
    for go_id in existing_umap:
        if go_id not in final_coords:
            final_coords[go_id] = existing_umap[go_id]

    # Step 4: Write output
    print(f"\nWriting {len(final_coords)} embeddings to {OUTPUT_CSV}...")
    with open(OUTPUT_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["GO_ID", "x", "y"])
        for go_id in sorted(final_coords.keys()):
            x, y = final_coords[go_id]
            writer.writerow([f"GO:{go_id}", f"{x:.6f}", f"{y:.6f}"])

    print("Done!")

    # Also generate a parent mapping JSON for the frontend
    # This maps each GO term to its direct parent(s) GO IDs
    parent_map_path = os.path.join(PROJECT_DIR, "public", "data", "go_parent_map.json")
    print(f"\nGenerating parent map at {parent_map_path}...")

    # Build a map: for each term in GO_layers, find direct parents that are also in GO_layers
    parent_map = {}
    for go_id in go_layers:
        parents = child_to_parents.get(go_id, set())
        # Filter to parents that are in our layer system
        valid_parents = [p for p in parents if p in go_layers and go_layers[p] > go_layers[go_id]]
        if valid_parents:
            parent_map[go_id] = valid_parents

    with open(parent_map_path, "w") as f:
        json.dump(parent_map, f)
    print(f"  {len(parent_map)} terms with parent mappings")

    print("\nAll done!")


if __name__ == "__main__":
    compute_hierarchical_embeddings()
