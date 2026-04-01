/**
 * Mondrian Map — Offline Pipeline Orchestrator.
 *
 * Runs the entire pipeline client-side using pre-computed lookup tables:
 *   1. Enrichment (Fisher's exact test against library JSON)
 *   2. GO hierarchy annotation (GO_layers.csv parsed at startup)
 *   3. 2D coordinates (go_embeddings_umap.csv lookup)
 *   4. Block sizing (significance → area)
 *   5. Crosstalk edges (Jaccard Index of shared genes)
 *
 * Falls back to /api/process (Flask backend) if any lookup is missing.
 */

import { runEnrichment, enrichmentToNodes, deduplicateNodes } from './enrichment.js';

// ── Color Assignment ─────────────────────────────────────────────────────

const COLOR_MAP = {
    upregulated: '#E30022',
    downregulated: '#0078BF',
    shared: '#FFD700',
};

// ── Lookup Loaders (cached in memory) ────────────────────────────────────

let _umapLookup = null;
let _goLayersLookup = null;
let _libraryCache = {};
let _libraryIndex = null;

export async function loadLibraryIndex() {
    if (_libraryIndex) return _libraryIndex;
    try {
        const res = await fetch('/data/library_index.json');
        if (!res.ok) throw new Error('not found');
        _libraryIndex = await res.json();
        return _libraryIndex;
    } catch {
        return null;
    }
}

export async function loadLibrary(libraryId) {
    if (_libraryCache[libraryId]) return _libraryCache[libraryId];
    try {
        const res = await fetch(`/data/libraries/${libraryId}.json`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        _libraryCache[libraryId] = data;
        return data;
    } catch {
        return null;
    }
}

async function loadUmapLookup() {
    if (_umapLookup) return _umapLookup;
    try {
        // Prefer hierarchical embeddings (parent-child locality preserved)
        // Falls back to original UMAP if hierarchical not available
        let res = await fetch('/data/go_embeddings_hierarchical.csv');
        if (!res.ok) {
            console.log('[Pipeline] Hierarchical embeddings not found, falling back to UMAP...');
            res = await fetch('/data/go_embeddings_umap.csv');
        }
        if (!res.ok) throw new Error('not found');
        const text = await res.text();
        const lines = text.trim().split('\n');
        _umapLookup = {};
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 3) {
                const goId = parts[0].replace('GO:', '').trim();
                _umapLookup[goId] = {
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                };
            }
        }
        return _umapLookup;
    } catch {
        return null;
    }
}

async function loadGoLayers() {
    if (_goLayersLookup) return _goLayersLookup;
    try {
        const res = await fetch('/data/GO_layers.csv');
        if (!res.ok) throw new Error('not found');
        return parseGoLayersCsv(await res.text());
    } catch {
        return null;
    }
}

function parseGoLayersCsv(text) {
    const lines = text.trim().split('\n');
    _goLayersLookup = {};
    // Skip header: ID,layer,category,size,depth,level
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 6) {
            const goId = parts[0].replace('GO:', '').trim();
            _goLayersLookup[goId] = {
                layer: parseInt(parts[1]) || 0,
                category: parts[2]?.trim() || 'biological_process',
                size: parseInt(parts[3]) || 0,
                depth: parseInt(parts[4]) || 0,
                level: parseInt(parts[5]) || 0,
            };
        }
    }
    return _goLayersLookup;
}


// ── Block Sizing ─────────────────────────────────────────────────────────

function calculateBlockSizes(nodes, scaleFactor = 500, minArea = 400, maxArea = 10000, gridSize = 10) {
    for (const node of nodes) {
        const sig = node.significance_score || 1.0;
        const area = Math.max(minArea, Math.min(maxArea, sig * scaleFactor));
        const side = Math.round(Math.sqrt(area));
        const w = Math.max(gridSize, Math.round(side / gridSize) * gridSize);
        node.block_w = w;
        node.block_h = w;
    }
    return nodes;
}


// ── Canvas Scaling ───────────────────────────────────────────────────────

function scaleToCanvas(coordsDict, width = 1000, height = 1000, padding = 50, gridSize = 10) {
    const usableW = width - 2 * padding;
    const usableH = height - 2 * padding;
    const result = {};

    for (const [gid, coord] of Object.entries(coordsDict)) {
        let x = (coord.x + 1) / 2 * usableW + padding;
        let y = (coord.y + 1) / 2 * usableH + padding;
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
        x = Math.max(padding, Math.min(width - padding, x));
        y = Math.max(padding, Math.min(height - padding, y));
        result[gid] = { x, y };
    }

    return result;
}


// ── Jaccard Crosstalk ────────────────────────────────────────────────────

function calculateCrosstalk(nodes, jaccardThreshold = 0.15) {
    const edges = [];
    const n = nodes.length;

    for (let i = 0; i < n; i++) {
        const genesA = new Set(nodes[i].genes || []);
        if (genesA.size === 0) continue;

        for (let j = i + 1; j < n; j++) {
            const genesB = new Set(nodes[j].genes || []);
            if (genesB.size === 0) continue;

            let intersection = 0;
            for (const g of genesA) {
                if (genesB.has(g)) intersection++;
            }
            const union = genesA.size + genesB.size - intersection;
            if (union === 0) continue;

            const jaccard = intersection / union;
            if (jaccard >= jaccardThreshold) {
                edges.push({
                    source: nodes[i].go_id,
                    target: nodes[j].go_id,
                    weight: Math.round(jaccard * 10000) / 10000,
                    type: 'gene_overlap',
                });
            }
        }
    }

    edges.sort((a, b) => b.weight - a.weight);
    return edges;
}


// ── Main Pipeline ────────────────────────────────────────────────────────

/**
 * Run the full offline Mondrian Map pipeline.
 *
 * @param {Object} params
 * @param {string[]} params.upGenes
 * @param {string[]} params.downGenes
 * @param {string} params.libraryId - library name, e.g. "GO_Biological_Process_2023"
 * @param {string} params.caseName
 * @param {string} params.contrast
 * @param {number} params.cutoff - adjusted p-value cutoff
 * @param {number} params.jaccardThreshold
 * @param {number} params.canvasWidth
 * @param {number} params.canvasHeight
 * @returns {Object|null} layout JSON in the same schema as the Python backend
 */
export async function runOfflinePipeline({
    upGenes = [],
    downGenes = [],
    libraryId = 'GO_Biological_Process_2023',
    caseName = 'Custom Analysis',
    contrast = '',
    cutoff = 0.05,
    jaccardThreshold = 0.15,
    canvasWidth = 1000,
    canvasHeight = 1000,
}) {
    console.log('[Offline Pipeline] Starting...');

    // Load lookups in parallel
    const [library, umapLookup, goLayers] = await Promise.all([
        loadLibrary(libraryId),
        loadUmapLookup(),
        loadGoLayers(),
    ]);

    if (!library) {
        throw new Error(`Library "${libraryId}" not found. Run generate_lookup_tables.py first.`);
    }

    // Step 1: Enrichment
    console.log('[Offline Pipeline] Step 1: Enrichment analysis...');
    let allNodes = [];

    if (upGenes.length >= 5) {
        const upResults = runEnrichment(upGenes, library, cutoff);
        console.log(`  Upregulated: ${upResults.length} significant terms`);
        allNodes.push(...enrichmentToNodes(upResults, 'upregulated'));
    }

    if (downGenes.length >= 5) {
        const downResults = runEnrichment(downGenes, library, cutoff);
        console.log(`  Downregulated: ${downResults.length} significant terms`);
        allNodes.push(...enrichmentToNodes(downResults, 'downregulated'));
    }

    if (allNodes.length === 0) {
        console.log('[Offline Pipeline] No significant GO terms found.');
        return {
            metadata: {
                case_study: caseName,
                contrast,
                input_gene_count: new Set([...upGenes, ...downGenes]).size,
                up_gene_count: upGenes.length,
                down_gene_count: downGenes.length,
                enriched_go_terms: 0,
                total_edges: 0,
                enrichment_library: libraryId,
                enrichment_cutoff: cutoff,
                jaccard_threshold: jaccardThreshold,
                canvas_size: { width: canvasWidth, height: canvasHeight },
                generated_at: new Date().toISOString(),
                pipeline: 'offline',
                empty: true,
            },
            nodes: [],
            edges: [],
        };
    }

    // Deduplicate
    allNodes = deduplicateNodes(allNodes);
    console.log(`  Total unique GO terms: ${allNodes.length}`);

    // Step 2: GO Hierarchy annotation
    console.log('[Offline Pipeline] Step 2: GO hierarchy lookup...');
    if (goLayers) {
        for (const node of allNodes) {
            const info = goLayers[node.go_id] || {};
            node.layer = info.layer || 0;
            node.level = info.level || 0;
            node.go_size = info.size || 0;
            node.go_category = info.category || 'biological_process';
            node.go_depth = info.depth || 0;
        }
    }

    // Step 3: 2D coordinates from UMAP lookup
    console.log('[Offline Pipeline] Step 3: UMAP coordinate lookup...');
    const continuousCoords = {};
    let mappedCount = 0;
    for (const node of allNodes) {
        if (umapLookup && umapLookup[node.go_id]) {
            continuousCoords[node.go_id] = umapLookup[node.go_id];
            mappedCount++;
        } else {
            // Fallback: hash-based deterministic position
            continuousCoords[node.go_id] = hashPosition(node.go_id);
        }
    }
    console.log(`  ${mappedCount}/${allNodes.length} terms found in UMAP lookup`);

    const canvasCoords = scaleToCanvas(continuousCoords, canvasWidth, canvasHeight);

    // Step 4: Block sizes
    console.log('[Offline Pipeline] Step 4: Block sizing...');
    allNodes = calculateBlockSizes(allNodes);

    // Assign coords and colors
    for (const node of allNodes) {
        node.continuous_coords = continuousCoords[node.go_id] || { x: 0, y: 0 };
        const cc = canvasCoords[node.go_id] || { x: canvasWidth / 2, y: canvasHeight / 2 };
        node.grid_coords = {
            x: cc.x,
            y: cc.y,
            w: node.block_w || 20,
            h: node.block_h || 20,
        };
        node.color = COLOR_MAP[node.direction] || '#1D1D1D';
    }

    // Step 5: Crosstalk edges
    console.log('[Offline Pipeline] Step 5: Jaccard crosstalk...');
    const edges = calculateCrosstalk(allNodes, jaccardThreshold);
    console.log(`  ${edges.length} edges (Jaccard >= ${jaccardThreshold})`);

    // Build output
    const outputNodes = allNodes.map(n => ({
        go_id: n.go_id,
        name: n.name,
        direction: n.direction,
        significance_score: n.significance_score,
        adjusted_p_value: n.adjusted_p_value,
        gene_count: n.gene_count,
        genes: n.genes,
        continuous_coords: n.continuous_coords,
        grid_coords: n.grid_coords,
        layer: n.layer || 0,
        level: n.level || 0,
        color: n.color,
    }));

    const outputEdges = edges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        type: e.type,
    }));

    const output = {
        metadata: {
            case_study: caseName,
            contrast,
            input_gene_count: new Set([...upGenes, ...downGenes]).size,
            up_gene_count: upGenes.length,
            down_gene_count: downGenes.length,
            enriched_go_terms: outputNodes.length,
            total_edges: outputEdges.length,
            enrichment_library: libraryId,
            enrichment_cutoff: cutoff,
            jaccard_threshold: jaccardThreshold,
            canvas_size: { width: canvasWidth, height: canvasHeight },
            generated_at: new Date().toISOString(),
            pipeline: 'offline',
        },
        nodes: outputNodes,
        edges: outputEdges,
    };

    console.log(`[Offline Pipeline] Complete: ${outputNodes.length} nodes, ${outputEdges.length} edges`);
    return output;
}


/**
 * Deterministic hash-based fallback position for GO terms not in UMAP lookup.
 */
function hashPosition(goId) {
    let hash = 0;
    const str = `GO:${goId}`;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    // Map to [-1, 1] range
    const x = ((hash & 0xFFFF) / 0xFFFF) * 2 - 1;
    const y = (((hash >>> 16) & 0xFFFF) / 0xFFFF) * 2 - 1;
    return { x, y };
}


/**
 * Check if offline pipeline is available (all lookup tables exist).
 */
export async function isOfflineAvailable() {
    try {
        const [indexRes, hierRes, umapRes] = await Promise.all([
            fetch('/data/library_index.json', { method: 'HEAD' }),
            fetch('/data/go_embeddings_hierarchical.csv', { method: 'HEAD' }),
            fetch('/data/go_embeddings_umap.csv', { method: 'HEAD' }),
        ]);
        // Need index + at least one embedding file
        return indexRes.ok && (hierRes.ok || umapRes.ok);
    } catch {
        return false;
    }
}
