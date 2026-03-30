import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MondrianMap from './components/MondrianMap';
import DataTable from './components/DataTable';
import GeneSetInput from './components/GeneSetInput';
import ParameterControls, { PARAMETER_DEFAULTS } from './components/ParameterControls';
import AIExplainPanel from './components/AIExplainPanel';
import { ChevronLeft, Menu, Sparkles, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { runOfflinePipeline, isOfflineAvailable } from './utils/offlinePipeline.js';

function App() {
    // --- Data State ---
    const [layoutJson, setLayoutJson] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);

    // --- UI State ---
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

    // --- AI Explain: nodes currently selected on the Mondrian Map ---
    const [selectedNodes, setSelectedNodes] = useState([]);
    // Exact edge-ID set from MondrianMap's selection state — used to filter crosstalks precisely.
    const [selectedRelationshipIds, setSelectedRelationshipIds] = useState(new Set());

    // --- Ref to MondrianMap — used to call downloadMap imperatively ---
    const mondrianMapRef = useRef(null);

    // --- Parameters ---
    const [parameters, setParameters] = useState({ ...PARAMETER_DEFAULTS });

    // No auto-load — start empty, render only after user triggers analysis

    /**
     * Apply a fresh layout JSON, resetting parameters to sensible defaults.
     * Selects the smallest available layer; maxBlocks/maxEdges set to max for that layer.
     */
    const applyNewLayoutJson = (json, baseParams = parameters) => {
        setLayoutJson(json);
        setError(null);
        setInfo(null);

        const layers = getAvailableLayers(json);
        const defaultLayer = layers.length > 0 ? layers[0] : null;

        // Compute per-layer counts at default p-value cutoff
        const nc = countNodesForLayer(json, defaultLayer, baseParams.pValueCutoff);
        const ec = countEdgesForLayer(json, defaultLayer, baseParams.pValueCutoff, baseParams.jaccardThreshold);

        setParameters({
            ...baseParams,
            selectedLayer: defaultLayer,
            maxBlocks: nc,
            maxEdges: ec,
        });
    };

    // --- Run enrichment analysis: offline-first, backend fallback ---
    const handleRunAnalysis = useCallback(async ({ up_genes, down_genes, case_study, contrast, library }) => {
        setIsLoading(true);
        setError(null);
        setInfo(null);
        const libraryId = library || 'GO_Biological_Process_2023';

        try {
            // Try offline pipeline first (works on Netlify, no backend needed)
            const offlineOk = await isOfflineAvailable();
            if (offlineOk) {
                console.log('[App] Using offline pipeline...');
                const result = await runOfflinePipeline({
                    upGenes: up_genes,
                    downGenes: down_genes,
                    libraryId,
                    caseName: case_study,
                    contrast,
                    cutoff: parameters.pValueCutoff,
                    jaccardThreshold: parameters.jaccardThreshold,
                });
                if (result.metadata?.empty) {
                    // No significant terms — clear canvas, show soft info message
                    setLayoutJson(null);
                    setInfo('No significant GO terms found. Try a different library or lower the p-value cutoff.');
                } else {
                    applyNewLayoutJson(result);
                }
                return;
            }

            // Fallback: Flask backend (local dev)
            console.log('[App] Offline not available, trying backend...');
            const response = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    up_genes, down_genes, case_study, contrast,
                    library: libraryId,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`);
            applyNewLayoutJson(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [parameters.pValueCutoff, parameters.jaccardThreshold]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleParametersChange = useCallback((newParams) => {
        setParameters(newParams);
    }, []);

    // --- AI Explain: receive selection updates from MondrianMap ---
    // Closes the panel automatically when the user deselects everything,
    // enforcing the rule that AI Explain only exists in selection mode.
    const handleSelectionChange = useCallback((selectedEntities, rawSelection) => {
        setSelectedNodes(selectedEntities);
        // Propagate the exact relationship-ID set so AIHypothesisPanel can filter
        // crosstalks to only those explicitly part of the selection.
        setSelectedRelationshipIds(rawSelection?.relationships ?? new Set());
        if (selectedEntities.length === 0) {
            setIsAIPanelOpen(false);
        }
    }, []);

    // --- Derived: available layers ---
    const availableLayers = useMemo(() => getAvailableLayers(layoutJson), [layoutJson]);

    // --- Derived: per-layer node/edge counts (for layer-adaptive defaults) ---
    const layerNodeCounts = useMemo(() => {
        if (!layoutJson) return {};
        const result = {};
        const { pValueCutoff } = parameters;
        availableLayers.forEach(layer => {
            result[layer] = countNodesForLayer(layoutJson, layer, pValueCutoff);
        });
        result[null] = countNodesForLayer(layoutJson, null, pValueCutoff);
        return result;
    }, [layoutJson, availableLayers, parameters.pValueCutoff]);

    const layerEdgeCounts = useMemo(() => {
        if (!layoutJson) return {};
        const result = {};
        const { pValueCutoff, jaccardThreshold } = parameters;
        availableLayers.forEach(layer => {
            result[layer] = countEdgesForLayer(layoutJson, layer, pValueCutoff, jaccardThreshold);
        });
        result[null] = countEdgesForLayer(layoutJson, null, pValueCutoff, jaccardThreshold);
        return result;
    }, [layoutJson, availableLayers, parameters.pValueCutoff, parameters.jaccardThreshold]);

    // --- Derived: current counts (for slider maxes) ---
    const totalNodeCount = useMemo(
        () => layerNodeCounts[parameters.selectedLayer] ?? 0,
        [layerNodeCounts, parameters.selectedLayer]
    );
    const totalEdgeCount = useMemo(
        () => layerEdgeCounts[parameters.selectedLayer] ?? 0,
        [layerEdgeCounts, parameters.selectedLayer]
    );

    // --- Derived: entities/relationships for visualization ---
    const { entities, relationships } = useMemo(() => {
        if (!layoutJson) return { entities: [], relationships: [] };
        return mapRealDataToEntities(layoutJson, parameters);
    }, [layoutJson, parameters]);

    return (
        <div className="h-screen w-screen overflow-hidden bg-gray-50 flex font-sans">
            {/* Collapsible Sidebar */}
            <AnimatePresence mode='wait'>
                {isPanelOpen && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "500px", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="h-full bg-white shadow-xl z-20 flex flex-col border-r border-gray-200 relative shrink-0"
                    >
                        <div className="w-[500px] h-full flex flex-col p-6 overflow-y-auto overflow-x-hidden">
                            {/* Header */}
                            <div className="mb-8">
                                <h1 className="text-3xl font-bold mb-1 text-black tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Mondrian Map
                                </h1>
                                <p className="text-gray-500 text-sm mt-0.5">A Modern GO Enrichment Explorer</p>
                            </div>

                            <div className="flex flex-col gap-6">
                                {/* Gene Set Input */}
                                <GeneSetInput
                                    onRunAnalysis={handleRunAnalysis}
                                    isLoading={isLoading}
                                />

                                {/* Error message */}
                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-none">
                                        <span className="font-bold">Error:</span> {error}
                                    </div>
                                )}

                                {/* Info message (no results, etc.) */}
                                {info && !error && (
                                    <div className="bg-gray-50 border border-gray-200 text-gray-600 text-xs px-3 py-2 rounded-none">
                                        {info}
                                    </div>
                                )}

                                {/* Parameter Controls */}
                                <ParameterControls
                                    parameters={parameters}
                                    onParametersChange={handleParametersChange}
                                    nodeCount={totalNodeCount}
                                    edgeCount={totalEdgeCount}
                                    availableLayers={availableLayers}
                                    layerNodeCounts={layerNodeCounts}
                                    layerEdgeCounts={layerEdgeCounts}
                                />

                                <hr className="border-gray-100" />

                                <DataTable
                                    layoutJson={layoutJson}
                                    onSelectionToggle={(type, id, isMulti) =>
                                        mondrianMapRef.current?.toggleSelection(type, id, isMulti)
                                    }
                                    selection={{
                                        nodes: new Set(selectedNodes.map(n => n.id)),
                                        edges: selectedRelationshipIds
                                    }}
                                />
                            </div>
                        </div>

                        {/* Collapse toggle */}
                        <button
                            onClick={() => setIsPanelOpen(false)}
                            className="absolute top-1/2 -right-3 transform -translate-y-1/2 bg-white border border-gray-200 shadow-md rounded-full p-1 hover:bg-gray-50 z-30"
                            title="Collapse sidebar"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Area — shifts right padding to match the AI panel so
                the map always stays centred between the two panels. The
                MondrianMap's ResizeObserver picks this up automatically. */}
            <div
                className="flex-1 relative h-full"
                style={{
                    paddingRight: isAIPanelOpen ? '440px' : '0',
                    transition: 'padding-right 0.25s ease-in-out',
                }}
            >
                <AnimatePresence>
                    {!isPanelOpen && (
                        <motion.button
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onClick={() => setIsPanelOpen(true)}
                            className="absolute top-6 left-6 z-10 bg-white p-3 rounded-md shadow-lg hover:bg-gray-50 text-gray-700"
                        >
                            <Menu size={24} />
                        </motion.button>
                    )}
                </AnimatePresence>

                <MondrianMap
                    ref={mondrianMapRef}
                    entities={entities}
                    relationships={relationships}
                    width={1000}
                    height={1000}
                    parameters={parameters}
                    isLoading={isLoading}
                    onSelectionChange={handleSelectionChange}
                />

                {/* ── Bottom-right button stack ── */}
                <div className="absolute bottom-6 right-6 z-10 flex flex-col items-stretch gap-2">
                    {/* Download Full — always visible when there is map data */}
                    <AnimatePresence>
                        {layoutJson && (
                            <motion.button
                                key="dl-full"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.18 }}

                                onClick={() => {
                                    const caseName = (layoutJson?.metadata?.case_study || 'analysis').replace(/\s+/g, '_');
                                    const filename = `mondrian_map_full_${caseName}.svg`;
                                    mondrianMapRef.current?.downloadMap('full', filename);
                                }}
                                className="flex items-center justify-center gap-2 bg-white text-black border border-gray-300 px-4 py-2.5 shadow-md hover:bg-gray-50 active:bg-gray-100 transition-colors text-xs font-bold uppercase tracking-wider min-w-[200px]"
                                title="Download full Mondrian Map as SVG"
                            >
                                <Download size={14} />
                                Download Full Mondrian Map
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* Download Selection — only when ≥1 node is selected */}
                    <AnimatePresence>
                        {selectedNodes.length >= 1 && (
                            <motion.button
                                key="dl-selection"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.18 }}
                                onClick={() => {
                                    const caseName = (layoutJson?.metadata?.case_study || 'analysis').replace(/\s+/g, '_');
                                    const filename = `mondrian_map_selection_${caseName}.svg`;
                                    mondrianMapRef.current?.downloadMap('selection', filename);
                                }}
                                className="flex items-center justify-center gap-2 bg-white text-black border border-gray-300 px-4 py-2.5 shadow-md hover:bg-gray-50 active:bg-gray-100 transition-colors text-xs font-bold uppercase tracking-wider min-w-[200px]"
                                title="Download selected blocks as SVG"
                            >
                                <Download size={14} />
                                Download Selected Mondrian Map
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* AI Hypothesis — only when ≥1 node selected AND panel is closed.
                        Selection mode is the ONLY entry point into the AI feature. */}
                    <AnimatePresence>
                        {selectedNodes.length >= 1 && !isAIPanelOpen && (
                            <motion.button
                                key="ai-hypothesis-btn"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.18 }}
                                onClick={() => setIsAIPanelOpen(true)}
                                className="flex items-center justify-center gap-2 bg-black text-white px-4 py-2.5 shadow-md hover:bg-gray-900 active:bg-gray-700 transition-colors text-xs font-bold uppercase tracking-wider"
                                title={`Generate AI hypothesis for ${selectedNodes.length} selected term${selectedNodes.length > 1 ? 's' : ''}`}
                            >
                                <Sparkles size={14} />
                                AI Hypothesis
                                <span className="ml-1 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5">
                                    {selectedNodes.length}
                                </span>
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* AI Explain slide-out panel */}
                <AIExplainPanel
                    isOpen={isAIPanelOpen}
                    onClose={() => setIsAIPanelOpen(false)}
                    selectedNodes={selectedNodes}
                    selectedRelationshipIds={selectedRelationshipIds}
                    allEdges={relationships}
                    metadata={layoutJson?.metadata || {}}
                    parameters={parameters}
                />
            </div>
        </div>
    );
}


// ---------------------------------------------------------------------------
// Pure helper functions (no React state)
// ---------------------------------------------------------------------------

function getAvailableLayers(layoutJson) {
    if (!layoutJson?.nodes) return [];
    const layers = new Set(layoutJson.nodes.map(n => n.layer).filter(l => l > 0));
    return [...layers].sort((a, b) => a - b);
}

function countNodesForLayer(layoutJson, layer, pValueCutoff) {
    if (!layoutJson?.nodes) return 0;
    return layoutJson.nodes.filter(n => {
        const inLayer = layer === null ? true : n.layer === layer;
        const passesPValue = n.adjusted_p_value <= pValueCutoff;
        return inLayer && passesPValue;
    }).length;
}

function countEdgesForLayer(layoutJson, layer, pValueCutoff, jaccardThreshold) {
    if (!layoutJson?.nodes || !layoutJson?.edges) return 0;
    const nodeIds = new Set(
        layoutJson.nodes
            .filter(n => {
                const inLayer = layer === null ? true : n.layer === layer;
                return inLayer && n.adjusted_p_value <= pValueCutoff;
            })
            .map(n => n.go_id)
    );
    return layoutJson.edges.filter(e =>
        nodeIds.has(e.source) && nodeIds.has(e.target) && e.weight >= jaccardThreshold
    ).length;
}

/**
 * Map pipeline JSON to the entity/relationship format used by MondrianMap,
 * applying all active parameter filters and limits.
 */
function mapRealDataToEntities(layoutJson, parameters) {
    if (!layoutJson?.nodes) return { entities: [], relationships: [] };

    const { selectedLayer, pValueCutoff, jaccardThreshold, maxBlocks, maxEdges, blockSizeMultiplier } = parameters;

    // 1. Filter by layer (data-driven — no hardcoded layer limit)
    let nodes = layoutJson.nodes.filter(n =>
        selectedLayer === null || n.layer === selectedLayer
    );

    // 2. Filter by adj. p-value threshold
    nodes = nodes.filter(n => n.adjusted_p_value <= pValueCutoff);

    // 3. Sort by significance (highest first) and limit to # GO Terms
    nodes.sort((a, b) => b.significance_score - a.significance_score);
    nodes = nodes.slice(0, maxBlocks);

    const nodeIds = new Set(nodes.map(n => n.go_id));

    const entities = nodes.map(node => ({
        id: `GO:${node.go_id}`,
        go_id: node.go_id,
        name: node.name,
        x: node.grid_coords.x,
        y: node.grid_coords.y,
        w: node.grid_coords.w * blockSizeMultiplier,
        h: node.grid_coords.h * blockSizeMultiplier,
        foldChange: node.direction === 'upregulated' ? 1.5 : node.direction === 'downregulated' ? 0.5 : 1.0,
        pValue: node.adjusted_p_value,
        significance_score: node.significance_score,
        direction: node.direction,
        color: node.color,
        gene_count: node.gene_count,
        genes: node.genes || [],
        layer: node.layer,
        level: node.level,
    }));

    // 4. Filter edges: both endpoints in view AND above Jaccard threshold
    let edges = layoutJson.edges.filter(e =>
        nodeIds.has(e.source) && nodeIds.has(e.target) && e.weight >= jaccardThreshold
    );

    // 5. Sort by weight and limit to # Crosstalks
    edges.sort((a, b) => b.weight - a.weight);
    edges = edges.slice(0, maxEdges);

    const relationships = edges.map(e => ({
        source: `GO:${e.source}`,
        target: `GO:${e.target}`,
        weight: e.weight,
        type: e.type || 'gene_overlap',
    }));

    return { entities, relationships };
}


export default App;
