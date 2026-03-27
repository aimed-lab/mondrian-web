"""
Layout Module for Mondrian Map Pipeline.

Handles dimensionality reduction (UMAP or fallback MDS) and canvas scaling.
Converts high-dimensional embeddings to 2D positions on a canvas grid.
"""

import math

import numpy as np


# --- Mode 1: UMAP-based layout (requires umap-learn) ---

def compute_umap_layout(embeddings_dict, n_neighbors=15, min_dist=0.1, random_state=42):
    """
    Compute 2D layout using UMAP dimensionality reduction.

    Args:
        embeddings_dict: {go_id: np.ndarray} mapping
        n_neighbors: UMAP local connectivity parameter
        min_dist: Minimum distance between points
        random_state: Random seed for reproducibility

    Returns:
        dict: {go_id: {"x": float, "y": float}} with coordinates in [-1, 1]
    """
    import umap

    go_ids = list(embeddings_dict.keys())
    if len(go_ids) < 2:
        return {gid: {"x": 0.0, "y": 0.0} for gid in go_ids}

    # Stack embeddings into matrix
    matrix = np.array([embeddings_dict[gid] for gid in go_ids])

    # Adjust n_neighbors if we have too few samples
    effective_neighbors = min(n_neighbors, len(go_ids) - 1)
    effective_neighbors = max(2, effective_neighbors)

    # UMAP reduction to 2D
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=effective_neighbors,
        min_dist=min_dist,
        metric="cosine",
        random_state=random_state,
    )

    coords_2d = reducer.fit_transform(matrix)

    # Normalize to [-1, 1]
    coords_norm = _normalize_coords(coords_2d)

    result = {}
    for i, gid in enumerate(go_ids):
        result[gid] = {"x": float(coords_norm[i, 0]), "y": float(coords_norm[i, 1])}

    return result


# --- Mode 2: Fallback MDS-based layout (numpy only) ---

def compute_mds_layout(embeddings_dict, random_state=42):
    """
    Compute 2D layout using classical MDS (only needs numpy).
    This is a lightweight fallback when UMAP is not available.

    Args:
        embeddings_dict: {go_id: np.ndarray} mapping
        random_state: Random seed

    Returns:
        dict: {go_id: {"x": float, "y": float}} with coordinates in [-1, 1]
    """
    go_ids = list(embeddings_dict.keys())
    n = len(go_ids)

    if n < 2:
        return {gid: {"x": 0.0, "y": 0.0} for gid in go_ids}

    # Stack embeddings
    matrix = np.array([embeddings_dict[gid] for gid in go_ids])

    # Classical MDS via eigendecomposition of double-centered distance matrix
    # Step 1: Compute pairwise distance matrix
    # Use cosine distance
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-10)
    normalized = matrix / norms
    cosine_sim = normalized @ normalized.T
    cosine_sim = np.clip(cosine_sim, -1, 1)
    dist_sq = 2 * (1 - cosine_sim)  # Squared cosine distance

    # Step 2: Double centering
    n = dist_sq.shape[0]
    H = np.eye(n) - np.ones((n, n)) / n
    B = -0.5 * H @ dist_sq @ H

    # Step 3: Eigendecomposition
    eigenvalues, eigenvectors = np.linalg.eigh(B)

    # Take top 2 positive eigenvalues
    idx = np.argsort(eigenvalues)[::-1]
    top_idx = []
    for i in idx:
        if eigenvalues[i] > 1e-10:
            top_idx.append(i)
        if len(top_idx) == 2:
            break

    if len(top_idx) < 2:
        # Not enough positive eigenvalues; use random layout
        rng = np.random.RandomState(random_state)
        coords_2d = rng.randn(n, 2)
    else:
        coords_2d = eigenvectors[:, top_idx] * np.sqrt(eigenvalues[top_idx])

    # Normalize to [-1, 1]
    coords_norm = _normalize_coords(coords_2d)

    result = {}
    for i, gid in enumerate(go_ids):
        result[gid] = {"x": float(coords_norm[i, 0]), "y": float(coords_norm[i, 1])}

    return result


def compute_layout(embeddings_dict, mode="auto", **kwargs):
    """
    Compute 2D layout with automatic fallback.

    Args:
        embeddings_dict: {go_id: np.ndarray}
        mode: 'umap', 'mds', or 'auto'

    Returns:
        dict: {go_id: {"x": float, "y": float}}
    """
    if mode == "umap":
        return compute_umap_layout(embeddings_dict, **kwargs)
    elif mode == "mds":
        return compute_mds_layout(embeddings_dict, **kwargs)
    else:
        try:
            import umap
            print("  Using UMAP for layout...")
            return compute_umap_layout(embeddings_dict, **kwargs)
        except ImportError:
            print("  umap-learn not available, using MDS fallback...")
            return compute_mds_layout(embeddings_dict, **kwargs)


# --- Canvas Scaling ---

def scale_to_canvas(coords_dict, canvas_width=1000, canvas_height=1000, padding=50, grid_size=10):
    """
    Scale normalized [-1, 1] coordinates to canvas pixel positions.

    Args:
        coords_dict: {go_id: {"x": float, "y": float}} in [-1, 1]
        canvas_width: Target canvas width in pixels
        canvas_height: Target canvas height in pixels
        padding: Border padding in pixels
        grid_size: Grid snap size (default 10px for Mondrian aesthetic)

    Returns:
        dict: {go_id: {"x": int, "y": int}} in [padding, canvas - padding]
    """
    usable_w = canvas_width - 2 * padding
    usable_h = canvas_height - 2 * padding

    result = {}
    for gid, coord in coords_dict.items():
        # Scale from [-1, 1] to [0, usable_size]
        x_pixel = (coord["x"] + 1) / 2 * usable_w + padding
        y_pixel = (coord["y"] + 1) / 2 * usable_h + padding

        # Snap to grid
        x_snapped = round(x_pixel / grid_size) * grid_size
        y_snapped = round(y_pixel / grid_size) * grid_size

        # Clamp to bounds
        x_snapped = max(padding, min(canvas_width - padding, x_snapped))
        y_snapped = max(padding, min(canvas_height - padding, y_snapped))

        result[gid] = {"x": int(x_snapped), "y": int(y_snapped)}

    return result


def calculate_block_sizes(nodes, scale_factor=500, min_area=400, max_area=10000, grid_size=10):
    """
    Calculate block dimensions based on statistical significance.

    Args:
        nodes: List of node dicts with 'significance_score' field
        scale_factor: Multiplier for significance -> area conversion
        min_area: Minimum block area in pixels
        max_area: Maximum block area in pixels
        grid_size: Grid snap size

    Returns:
        List of nodes with added 'grid_coords' {x, y, w, h}
    """
    for node in nodes:
        sig = node.get("significance_score", 1.0)
        area = max(min_area, min(max_area, sig * scale_factor))
        side = int(math.sqrt(area))

        # Snap to grid
        w = max(grid_size, round(side / grid_size) * grid_size)
        h = w  # Square blocks

        node["block_w"] = w
        node["block_h"] = h

    return nodes


# --- Helpers ---

def _normalize_coords(coords_2d):
    """Normalize 2D coordinates to [-1, 1] range."""
    mins = coords_2d.min(axis=0)
    maxs = coords_2d.max(axis=0)
    ranges = maxs - mins

    # Avoid division by zero
    ranges = np.maximum(ranges, 1e-10)

    normalized = 2 * (coords_2d - mins) / ranges - 1
    return normalized
