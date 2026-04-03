import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MondrianMap from './components/MondrianMap';
import DataTable from './components/DataTable';
import GeneSetInput from './components/GeneSetInput';
import ParameterControls, { PARAMETER_DEFAULTS } from './components/ParameterControls';
import AIExplainPanel from './components/AIExplainPanel';
import LayerZoomControl from './components/LayerZoomControl';
import { ChevronLeft, ChevronRight, Menu, Sparkles, Download, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { runOfflinePipeline, isOfflineAvailable } from './utils/offlinePipeline.js';
import { getLayerSuffix } from './utils/layerSuffix.js';
import JSZip from 'jszip';
import InfoPanel from './components/InfoPanel';
import { computeRequiredCanvasSize } from './utils/canvasAutoSize.js';

const svgToPngBlob = (svgString, width = 1000, height = 1000) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const svgUrl = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#F3F4F6"; // background color (matches bg-gray-100)
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(svgUrl);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to convert canvas to blob"));
            }, "image/png");
        };
        img.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            reject(new Error("Failed to load SVG into image"));
        };
        img.src = svgUrl;
    });
};

function App() {
    // --- Data State ---
    const [layoutJson, setLayoutJson] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);

    // --- UI State ---
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    const [inputMode, setInputMode] = useState('custom');

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
        // Start at the highest (root-like) layer for the Google Maps zoom experience
        const defaultLayer = layers.length > 0 ? layers[layers.length - 1] : null;

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
    const handleSelectionChange = useCallback((selectedEntities, rawSelection) => {
        setSelectedNodes(selectedEntities);
        // Propagate the exact relationship-ID set so AIHypothesisPanel can filter
        // crosstalks to only those explicitly part of the selection.
        setSelectedRelationshipIds(rawSelection?.relationships ?? new Set());
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

    // --- Dynamic Canvas Size: auto-expand to resolve overlaps & border-touching ---
    // The overlap check now runs a D3 force simulation (matching MondrianMap's
    // resolveLayout) so it detects issues in the ACTUAL rendered positions, not
    // raw UMAP coordinates.
    //
    // Rules:
    //   - Individual layers (L1–L13): each computes its own required size; ALL
    //     individual layers are synced to the MAX across L1–L13.
    //   - "All Layers" (null): computes its own size INDEPENDENTLY — it does NOT
    //     cascade to L1–L13.
    const [allLayersCanvasSize, setAllLayersCanvasSize] = useState(1000);
    const [syncedLayerCanvasSize, setSyncedLayerCanvasSize] = useState(1000);
    const BASE_CANVAS_SIZE = 1000;

    // Compute canvas sizes when data or filter params change
    useEffect(() => {
        if (!layoutJson) {
            setAllLayersCanvasSize(BASE_CANVAS_SIZE);
            setSyncedLayerCanvasSize(BASE_CANVAS_SIZE);
            return;
        }

        const blockSpacing = parameters.blockSpacing || 5;
        const layers = getAvailableLayers(layoutJson);

        // 1. Compute for each individual layer, track the max
        let maxLayerSize = BASE_CANVAS_SIZE;
        for (const layer of layers) {
            const params = {
                ...parameters,
                selectedLayer: layer,
                maxBlocks: countNodesForLayer(layoutJson, layer, parameters.pValueCutoff),
                maxEdges: countEdgesForLayer(layoutJson, layer, parameters.pValueCutoff, parameters.jaccardThreshold),
            };
            const { entities: layerEntities } = mapRealDataToEntities(layoutJson, params);
            const required = computeRequiredCanvasSize(layerEntities, BASE_CANVAS_SIZE, 200, 3000, blockSpacing);
            if (required > maxLayerSize) maxLayerSize = required;
        }
        console.log(`[Canvas Auto-Size] Individual layers synced to ${maxLayerSize}×${maxLayerSize}`);
        setSyncedLayerCanvasSize(maxLayerSize);

        // 2. Compute for "All Layers" (independent)
        const allParams = {
            ...parameters,
            selectedLayer: null,
            maxBlocks: countNodesForLayer(layoutJson, null, parameters.pValueCutoff),
            maxEdges: countEdgesForLayer(layoutJson, null, parameters.pValueCutoff, parameters.jaccardThreshold),
        };
        const { entities: allEntities } = mapRealDataToEntities(layoutJson, allParams);
        const allRequired = computeRequiredCanvasSize(allEntities, BASE_CANVAS_SIZE, 200, 3000, blockSpacing);
        console.log(`[Canvas Auto-Size] All Layers requires ${allRequired}×${allRequired}`);
        setAllLayersCanvasSize(allRequired);
    }, [layoutJson, parameters.pValueCutoff, parameters.jaccardThreshold, parameters.blockSizeMultiplier, parameters.blockSpacing]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effective canvas size for the currently displayed layer
    const effectiveCanvasSize = useMemo(() => {
        if (parameters.selectedLayer === null) {
            return allLayersCanvasSize;
        }
        return syncedLayerCanvasSize;
    }, [allLayersCanvasSize, syncedLayerCanvasSize, parameters.selectedLayer]);

    // Helper to get the effective canvas size for a specific layer (used in downloads)
    const getCanvasSizeForLayer = useCallback((layer) => {
        if (layer === null) {
            return allLayersCanvasSize;
        }
        return syncedLayerCanvasSize;
    }, [allLayersCanvasSize, syncedLayerCanvasSize]);

    /**
     * Rescale entity x/y coordinates proportionally from the base canvas (1000) to the target size.
     * This ensures entities actually spread across the expanded canvas rather than bunching in center.
     */
    const rescaleEntitiesForCanvas = useCallback((ents, targetSize) => {
        if (targetSize === BASE_CANVAS_SIZE || !ents || ents.length === 0) return ents;
        const scale = targetSize / BASE_CANVAS_SIZE;
        return ents.map(e => ({ ...e, x: e.x * scale, y: e.y * scale }));
    }, []);

    // Rescale entities for the currently displayed canvas size
    const rescaledEntities = useMemo(() => {
        return rescaleEntitiesForCanvas(entities, effectiveCanvasSize);
    }, [entities, effectiveCanvasSize, rescaleEntitiesForCanvas]);

    // --- Layer zoom handler (for both scroll wheel and +/- buttons) ---
    const handleLayerZoom = useCallback((direction) => {
        // direction: +1 = zoom out (higher layer), -1 = zoom in (lower layer)
        if (!availableLayers || availableLayers.length === 0) return;
        const current = parameters.selectedLayer;
        const sortedLayers = [...availableLayers].sort((a, b) => a - b);

        if (current === null) {
            // From "All": zoom in → go to highest available layer
            if (direction === -1 && sortedLayers.length > 0) {
                const newLayer = sortedLayers[sortedLayers.length - 1];
                const nc = layerNodeCounts[newLayer] ?? 0;
                const ec = layerEdgeCounts[newLayer] ?? 0;
                setParameters(prev => ({ ...prev, selectedLayer: newLayer, maxBlocks: nc, maxEdges: ec }));
            }
            return;
        }

        const idx = sortedLayers.indexOf(current);
        if (idx === -1) return;

        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= sortedLayers.length) return;

        const newLayer = sortedLayers[newIdx];
        const nc = layerNodeCounts[newLayer] ?? 0;
        const ec = layerEdgeCounts[newLayer] ?? 0;
        setParameters(prev => ({
            ...prev,
            selectedLayer: newLayer,
            maxBlocks: nc,
            maxEdges: ec,
        }));
    }, [availableLayers, parameters.selectedLayer, layerNodeCounts, layerEdgeCounts]);

    const handleLayerChange = useCallback((newLayer) => {
        const nc = layerNodeCounts[newLayer] ?? 0;
        const ec = layerEdgeCounts[newLayer] ?? 0;
        setParameters(prev => ({
            ...prev,
            selectedLayer: newLayer,
            maxBlocks: nc,
            maxEdges: ec,
        }));
    }, [layerNodeCounts, layerEdgeCounts]);

    const handleDownloadAllLayersZip = async () => {
        if (!layoutJson || !mondrianMapRef.current) return;
        setIsLoading(true); // Show loader while downloading
        try {
            const zip = new JSZip();
            const case_study_slug = (layoutJson.metadata?.case_study || 'analysis').replace(/\s+/g, '_');

            // Use the component's availableLayers (which correctly excludes L0)
            const layersToDownload = availableLayers;

            // Helper to get parameters for a specific layer, using that layer's specific max limits
            const getParamsForLayer = (layer) => ({
                ...parameters,
                selectedLayer: layer,
                maxBlocks: layerNodeCounts[layer] || 10000,
                maxEdges: layerEdgeCounts[layer] || 10000,
            });

            // 1. Generate Combined (All Layers) map — uses its own canvas size
            const allCanvasSize = getCanvasSizeForLayer(null);
            const { entities: allEntities, relationships: allRelationships } = mapRealDataToEntities(layoutJson, getParamsForLayer(null));
            const allEntitiesScaled = rescaleEntitiesForCanvas(allEntities, allCanvasSize);
            const allSvg = mondrianMapRef.current.getSVG('full', allEntitiesScaled, allRelationships, allCanvasSize, allCanvasSize);
            zip.file(`mondrian_map_full_${case_study_slug}_all.svg`, allSvg);
            try {
                const allPng = await svgToPngBlob(allSvg, allCanvasSize, allCanvasSize);
                zip.file(`mondrian_map_full_${case_study_slug}_all.png`, allPng);
            } catch (e) {
                console.error("Failed to generate combined PNG:", e);
            }

            // 2. Generate each individual layer map — uses synced max canvas size
            const layerCanvasSize = getCanvasSizeForLayer(1); // any non-null layer returns the synced max
            for (const layer of layersToDownload) {
                const { entities: layerEntities, relationships: layerRelationships } = mapRealDataToEntities(layoutJson, getParamsForLayer(layer));
                if (layerEntities.length > 0) {
                    const layerEntitiesScaled = rescaleEntitiesForCanvas(layerEntities, layerCanvasSize);
                    const layerSvg = mondrianMapRef.current.getSVG('full', layerEntitiesScaled, layerRelationships, layerCanvasSize, layerCanvasSize);
                    zip.file(`mondrian_map_full_${case_study_slug}_L${layer}.svg`, layerSvg);
                    try {
                        const layerPng = await svgToPngBlob(layerSvg, layerCanvasSize, layerCanvasSize);
                        zip.file(`mondrian_map_full_${case_study_slug}_L${layer}.png`, layerPng);
                    } catch (e) {
                        console.error(`Failed to generate PNG for layer ${layer}:`, e);
                    }
                }
            }

            // Generate and download zip
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `mondrian_map_all_layers_${case_study_slug}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to generate ZIP:", error);
        } finally {
            setIsLoading(false); // Hide loader when done
        }
    };

    const isSelectionActive = selectedNodes.length > 0;
    const case_study_slug = (layoutJson?.metadata?.case_study || 'analysis').replace(/\s+/g, '_');
    const layerSuffix = parameters.selectedLayer === null ? '_all' : `_L${parameters.selectedLayer}`;
    const mapDownloadLabel = parameters.selectedLayer === null
        ? "Download Mondrian Map (All Layers Combined)"
        : `Download Mondrian Map (Layer ${parameters.selectedLayer})`;

    return (
        <div className="h-screen w-screen overflow-hidden bg-gray-50 flex font-sans">
            {/* Collapsible Left Sidebar — always mounted to preserve internal state */}
            <motion.div
                initial={false}
                animate={{
                    width: isPanelOpen ? 450 : 0,
                    opacity: isPanelOpen ? 1 : 0,
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="h-full bg-white shadow-xl z-20 flex flex-col border-r border-gray-200 relative shrink-0"
                style={{ overflow: 'visible' }}
            >
                <div className="w-full h-full overflow-hidden">
                    <div className="w-[450px] h-full flex flex-col p-6 overflow-y-auto overflow-x-hidden">
                        {/* Header */}
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold mb-1 text-black tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                                MondrianMap
                            </h1>
                            <p className="text-gray-500 text-sm mt-0.5 leading-relaxed">Navigating gene set hierarchies with multi-resolution maps</p>
                        </div>

                        <div className="flex flex-col gap-6">
                            {/* Gene Set Input */}
                            <GeneSetInput
                                onRunAnalysis={handleRunAnalysis}
                                isLoading={isLoading}
                                onModeChange={setInputMode}
                            />

                            {/* Error message */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-none">
                                    <span className="font-bold">Error:</span> {error}
                                </div>
                            )}

                            {/* Info message moved to canvas */}

                            <ParameterControls
                                parameters={parameters}
                                onParametersChange={handleParametersChange}
                                nodeCount={totalNodeCount}
                                edgeCount={totalEdgeCount}
                                availableLayers={availableLayers}
                                layerNodeCounts={layerNodeCounts}
                                layerEdgeCounts={layerEdgeCounts}
                            />
                        </div>

                        <InfoPanel />
                    </div>
                </div>

                {/* Collapse toggle — only visible when panel is open */}
                {isPanelOpen && (
                    <button
                        onClick={() => setIsPanelOpen(false)}
                        className="absolute top-1/2 -right-3 transform -translate-y-1/2 bg-white border border-gray-200 shadow-md rounded-full p-1 hover:bg-gray-50 z-30"
                        title="Collapse sidebar"
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}
            </motion.div>

            {/* Main Content Area */}
            <div className="flex-1 relative h-full min-w-0">
                {/* Empty State / Info Messages overlay */}
                {(!layoutJson && !isLoading && !error) && (
                    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                        <div className="text-gray-500 text-lg pointer-events-auto text-center mx-4 max-w-md">
                            {info ? info : (
                                inputMode === 'custom'
                                    ? "Enter your gene sets and click Run Enrichment Analysis to generate the Hierarchical Mondrian Maps."
                                    : "Select a case study and condition, then click Run Enrichment Analysis to generate the Hierarchical Mondrian Maps."
                            )}
                        </div>
                    </div>
                )}

                <AnimatePresence>
                    {!isPanelOpen && (
                        <motion.button
                            key="open-left"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onClick={() => setIsPanelOpen(true)}
                            className="absolute top-6 left-6 z-10 bg-white p-3 rounded-md shadow-lg hover:bg-gray-50 text-gray-700"
                        >
                            <Menu size={24} />
                        </motion.button>
                    )}
                    {layoutJson && !isRightPanelOpen && (
                        <motion.button
                            key="open-right"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            onClick={() => setIsRightPanelOpen(true)}
                            className="absolute top-6 right-6 z-10 bg-white p-3 rounded-md shadow-lg hover:bg-gray-50 text-gray-700"
                            title="Show results panel"
                        >
                            <ChevronLeft size={24} />
                        </motion.button>
                    )}
                </AnimatePresence>

                <MondrianMap
                    ref={mondrianMapRef}
                    entities={rescaledEntities}
                    relationships={relationships}
                    width={effectiveCanvasSize}
                    height={effectiveCanvasSize}
                    parameters={parameters}
                    isLoading={isLoading}
                    onSelectionChange={handleSelectionChange}
                    onLayerZoom={handleLayerZoom}
                />

                {/* ── Bottom-right Interaction Stack ── */}
                <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-3 pointer-events-none">
                    {/* Layer Zoom Control — right side of map, vertically centered previously, now on top of downloads */}
                    {layoutJson && availableLayers.length > 0 && (
                        <div className="pointer-events-auto">
                            <LayerZoomControl
                                currentLayer={parameters.selectedLayer}
                                availableLayers={availableLayers}
                                onLayerChange={handleLayerChange}
                                allLayers={13}
                                defaultLayer={Math.max(...availableLayers)}
                            />
                        </div>
                    )}

                    {/* Bottom-right button stack */}
                    <div className="flex flex-col items-stretch gap-2 w-full pointer-events-auto">
                        {/* Standard downloads (hidden in selection mode) */}
                        {!isSelectionActive && layoutJson && (
                            <AnimatePresence>
                                <motion.button
                                    key="dl-full"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    transition={{ duration: 0.18 }}
                                    onClick={() => {
                                        const caseName = (layoutJson?.metadata?.case_study || 'analysis').replace(/\s+/g, '_');
                                        const layerSuffix = getLayerSuffix(parameters.selectedLayer);
                                        const filename = `mondrian_map_full_${caseName}${layerSuffix}.svg`;
                                        mondrianMapRef.current?.downloadMap('full', filename);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-white text-black border border-gray-300 px-4 py-2.5 shadow-md hover:bg-gray-50 active:bg-gray-100 transition-colors text-xs font-bold uppercase tracking-wider min-w-[200px]"
                                    title={mapDownloadLabel}
                                >
                                    <Download size={14} />
                                    {mapDownloadLabel}
                                </motion.button>

                                <motion.button
                                    key="dl-zip"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    transition={{ duration: 0.18, delay: 0.05 }}
                                    onClick={handleDownloadAllLayersZip}
                                    className="flex items-center justify-center gap-2 bg-black text-white px-4 py-2.5 shadow-md hover:bg-gray-900 active:bg-gray-700 transition-colors text-xs font-bold uppercase tracking-wider"
                                    title="Download all layer maps in a ZIP archive"
                                >
                                    <Archive size={14} />
                                    Download Mondrian Maps (All Layers)
                                </motion.button>
                            </AnimatePresence>
                        )}

                        {/* Selection-specific downloads */}
                        {isSelectionActive && (
                            <AnimatePresence>
                                <motion.button
                                    key="dl-selection"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    transition={{ duration: 0.18 }}
                                    onClick={() => {
                                        const caseName = (layoutJson?.metadata?.case_study || 'analysis').replace(/\s+/g, '_');
                                        const layerSuffix = getLayerSuffix(parameters.selectedLayer);
                                        const filename = `mondrian_map_selection_${caseName}${layerSuffix}.svg`;
                                        mondrianMapRef.current?.downloadMap('selection', filename);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-white text-black border border-gray-300 px-4 py-2.5 shadow-md hover:bg-gray-50 active:bg-gray-100 transition-colors text-xs font-bold uppercase tracking-wider min-w-[200px]"
                                    title="Download only the currently selected terms"
                                >
                                    <Download size={14} />
                                    Download Mondrian Map (Selected)
                                </motion.button>
                            </AnimatePresence>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar for Enrichment Results & AI Explain — always mounted when data exists */}
            {layoutJson && (
                <motion.div
                    initial={false}
                    animate={{
                        width: isRightPanelOpen ? (isPanelOpen ? 506 : '40vw') : 0,
                        opacity: isRightPanelOpen ? 1 : 0,
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="h-full bg-gray-50 shadow-xl z-20 flex flex-col border-l border-gray-200 relative shrink-0"
                    style={{ overflow: 'visible' }}
                >
                    {/* Collapse toggle — only visible when panel is open */}
                    {isRightPanelOpen && (
                        <button
                            onClick={() => setIsRightPanelOpen(false)}
                            className="absolute top-1/2 -left-3 transform -translate-y-1/2 bg-white border border-gray-200 shadow-md rounded-full p-1 hover:bg-gray-50 z-30"
                            title="Collapse results panel"
                        >
                            <ChevronRight size={16} />
                        </button>
                    )}

                    <div className="w-full h-full overflow-hidden">
                        <div className="w-full h-full flex flex-col p-6 overflow-y-auto overflow-x-hidden pb-12" style={{ minWidth: isPanelOpen ? '506px' : '40vw' }}>
                            <DataTable
                                layoutJson={layoutJson}
                                filteredNodes={entities}
                                filteredEdges={relationships}
                                onSelectionToggle={(type, id, isMulti) =>
                                    mondrianMapRef.current?.toggleSelection(type, id, isMulti)
                                }
                                selection={{
                                    nodes: new Set(selectedNodes.map(n => n.id)),
                                    edges: selectedRelationshipIds
                                }}
                                currentLayer={parameters.selectedLayer}
                                aiSection={
                                    <AIExplainPanel
                                        selectedNodes={selectedNodes}
                                        selectedRelationshipIds={selectedRelationshipIds}
                                        allEdges={relationships}
                                        metadata={layoutJson?.metadata || {}}
                                        parameters={parameters}
                                    />
                                }
                            />
                        </div>
                    </div>
                </motion.div>
            )}
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
