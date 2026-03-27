import React, { useState, useEffect, useMemo, useCallback } from 'react';
import MondrianMap from './components/MondrianMap';
import DataTable from './components/DataTable';
import GeneSetInput from './components/GeneSetInput';
import ParameterControls, { PARAMETER_DEFAULTS } from './components/ParameterControls';
import { ChevronLeft, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
    // --- Data State ---
    const [layoutJson, setLayoutJson] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // --- UI State ---
    const [isPanelOpen, setIsPanelOpen] = useState(true);

    // --- Parameters ---
    const [parameters, setParameters] = useState({ ...PARAMETER_DEFAULTS });

    // --- Load sample data on mount ---
    useEffect(() => {
        fetch('/data/afatinib_layout.json')
            .then(res => { if (res.ok) return res.json(); throw new Error('not found'); })
            .then(json => { applyNewLayoutJson(json, { ...PARAMETER_DEFAULTS }); })
            .catch(() => { /* no sample data — wait for user input */ });
    }, []);

    /**
     * Apply a fresh layout JSON, resetting parameters to sensible defaults.
     * Selects the smallest available layer; maxBlocks/maxEdges set to max for that layer.
     */
    const applyNewLayoutJson = (json, baseParams = parameters) => {
        setLayoutJson(json);
        setError(null);

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

    // --- Run enrichment analysis via Flask API ---
    const handleRunAnalysis = useCallback(async ({ up_genes, down_genes, case_study, contrast }) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ up_genes, down_genes, case_study, contrast }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`);
            applyNewLayoutJson(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleParametersChange = useCallback((newParams) => {
        setParameters(newParams);
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
                                {layoutJson && (
                                    <div className="mt-3 text-sm text-gray-600 bg-gray-50 px-3 py-2 border border-gray-200">
                                        <span className="font-bold text-gray-900">{layoutJson.metadata?.case_study || 'Case Study'}</span>
                                        {layoutJson.metadata?.contrast && (
                                            <span className="ml-2 text-gray-500">| {layoutJson.metadata.contrast}</span>
                                        )}
                                    </div>
                                )}
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

                                <DataTable layoutJson={layoutJson} />
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

            {/* Main Content Area */}
            <div className="flex-1 relative h-full">
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
                    entities={entities}
                    relationships={relationships}
                    width={1000}
                    height={1000}
                    parameters={parameters}
                    isLoading={isLoading}
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
