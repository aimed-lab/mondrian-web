/**
 * Canvas Auto-Sizing Utility for Mondrian Map.
 *
 * Detects GO term rectangle overlaps and border violations AFTER running the
 * same D3 force simulation that MondrianMap uses, then computes the minimum
 * canvas size (in 200px increments) that resolves all issues.
 *
 * Rules:
 *   - Two GO term rectangles must NOT overlap each other.
 *   - No GO term rectangle may touch or exceed the canvas border.
 *   - Canvas expands by 200 in every direction (both width and height).
 *   - Maximum canvas size capped at 3000×3000.
 */

import * as d3 from 'd3';

const GRID_SIZE = 10;

function snap(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

/**
 * Get block dimensions for an entity (matches MondrianMap.getBlockDims for real data).
 */
function getBlockDims(entity) {
    const w = Math.max(GRID_SIZE, snap(entity.w || 20));
    const h = Math.max(GRID_SIZE, snap(entity.h || 20));
    return { w, h };
}

/**
 * Run the same D3 force simulation that MondrianMap uses to resolve overlaps.
 * This MUST match the logic in MondrianMap's resolveLayout to be accurate.
 *
 * @param {Array} entities - Array of entity objects with { x, y, w, h }
 * @param {number} blockSpacing - Spacing between blocks (default 5)
 * @returns {Array} Entities with updated x, y positions after simulation
 */
function runForceSimulation(entities, blockSpacing = 5) {
    if (!entities || entities.length === 0) return [];

    const nodes = entities.map(e => {
        const dims = getBlockDims(e);
        return {
            ...e,
            x: e.x,
            y: e.y,
            r: (Math.max(dims.w, dims.h) / 2) + blockSpacing,
        };
    });

    const simulation = d3.forceSimulation(nodes)
        .force("x", d3.forceX(d => d.x).strength(0.5))
        .force("y", d3.forceY(d => d.y).strength(0.5))
        .force("collide", d3.forceCollide(d => {
            const dims = getBlockDims(d);
            return (Math.max(dims.w, dims.h) * 0.75) + blockSpacing;
        }).strength(1).iterations(2))
        .stop();

    for (let i = 0; i < 300; ++i) simulation.tick();

    return nodes.map((n, i) => ({
        ...entities[i],
        x: n.x,
        y: n.y,
    }));
}

/**
 * Convert entity center-based coordinates to clamped rectangles
 * on a canvas of the given dimensions (matches MondrianMap.drawMap clamping).
 */
function entitiesToRects(entities, canvasW, canvasH) {
    return entities.map(entity => {
        const dims = getBlockDims(entity);
        const w = dims.w;
        const h = dims.h;
        const x = Math.max(0, Math.min(canvasW - w, snap(entity.x - w / 2)));
        const y = Math.max(0, Math.min(canvasH - h, snap(entity.y - h / 2)));
        return { x, y, w, h, id: entity.id };
    });
}

/**
 * Check if any pair of entity rectangles overlap (AABB intersection).
 * Sharing only an edge is NOT considered overlap.
 */
function hasOverlaps(rects) {
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            if (
                a.x < b.x + b.w &&
                a.x + a.w > b.x &&
                a.y < b.y + b.h &&
                a.y + a.h > b.y
            ) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Check if any entity rectangle touches or exceeds the canvas border.
 */
function hasBorderViolations(rects, canvasW, canvasH) {
    for (const r of rects) {
        if (r.x <= 0 || r.y <= 0) return true;
        if (r.x + r.w >= canvasW || r.y + r.h >= canvasH) return true;
    }
    return false;
}

/**
 * Rescale entity coordinates proportionally from the original canvas size
 * to a new canvas size.
 */
function rescaleEntities(entities, fromSize, toSize) {
    if (fromSize === toSize || fromSize === 0) return entities;
    const scale = toSize / fromSize;
    return entities.map(e => ({
        ...e,
        x: e.x * scale,
        y: e.y * scale,
    }));
}

/**
 * Compute the minimum canvas size (square, in `step`-px increments starting
 * from `baseSize`) such that AFTER force simulation and clamping:
 *   1. No entity rectangles overlap each other.
 *   2. No entity rectangle touches or exceeds the canvas border.
 *
 * The force simulation is run at each candidate size to match what MondrianMap
 * will actually do when rendering. This avoids false positives from raw UMAP
 * coordinates that the force simulation would resolve.
 *
 * @param {Array} entities - Array of entity objects with { x, y, w, h, ... }
 * @param {number} baseSize - Starting canvas size (default 1000)
 * @param {number} step - Expansion step in pixels (default 200)
 * @param {number} maxSize - Maximum canvas size cap (default 3000)
 * @param {number} blockSpacing - Block spacing for force simulation (default 5)
 * @returns {number} The required canvas size (square).
 */
export function computeRequiredCanvasSize(
    entities,
    baseSize = 1000,
    step = 200,
    maxSize = 3000,
    blockSpacing = 5
) {
    if (!entities || entities.length <= 1) return baseSize;

    let currentSize = baseSize;

    while (currentSize <= maxSize) {
        // 1. Rescale raw positions proportionally to the current canvas size
        const scaled = rescaleEntities(entities, baseSize, currentSize);

        // 2. Run force simulation (matches MondrianMap's resolveLayout)
        const simulated = runForceSimulation(scaled, blockSpacing);

        // 3. Clamp to canvas bounds (matches MondrianMap's drawMap clamping)
        const rects = entitiesToRects(simulated, currentSize, currentSize);

        // 4. Check for violations
        const overlaps = hasOverlaps(rects);
        const borderIssues = hasBorderViolations(rects, currentSize, currentSize);

        if (!overlaps && !borderIssues) {
            return currentSize;
        }

        currentSize += step;
    }

    // Hit the cap — return maxSize even if there are still issues
    return maxSize;
}
