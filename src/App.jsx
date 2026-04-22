import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './design/theme.css';

import { MondrianPlate, MapSurface } from './design/MondrianCanvas.jsx';
import { SearchPill, TopRightCluster, MapControls, MapLegend } from './design/MapUI.jsx';
import { LeftDrawer, DetailDrawer } from './design/Drawers.jsx';
import { ImportModal, LoginModal } from './design/Modals.jsx';
import { PARAMETER_DEFAULTS } from './components/ParameterControls.jsx';
import { runOfflinePipeline, isOfflineAvailable } from './utils/offlinePipeline.js';

const PLATE_W = 1200;
const PLATE_H = 1200;

function App() {
    // ── Data ──────────────────────────────────────────────────────────
    const [layoutJson, setLayoutJson] = useState(null);
    const [hierarchy, setHierarchy] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);

    // ── Parameters (shared with existing pipeline semantics) ──────────
    const [parameters, setParameters] = useState({
        ...PARAMETER_DEFAULTS,
        minGenes: 2,
    });

    // ── Design UI state ───────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [showEdges, setShowEdges] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [embedding] = useState('gobert_umap');

    // Pan/zoom ref + live view.k for label reveal
    const viewRef = useRef(null);
    const [zoom, setZoom] = useState(1);

    // ── Load GO hierarchy (for ghost parent carrying, preserved from old App) ──
    useEffect(() => {
        fetch('/data/go_hierarchy.json')
            .then(r => r.json()).then(setHierarchy)
            .catch(err => console.error('Failed to load GO hierarchy:', err));
    }, []);

    // ── Run analysis (ported verbatim from prior App.jsx — offline-first, backend fallback) ──
    const handleRunAnalysis = useCallback(async ({ up_genes, down_genes, case_study, contrast, library }) => {
        setIsLoading(true);
        setError(null);
        setInfo(null);
        const runPValueCutoff = 0.05;
        setParameters(p => ({ ...p, pValueCutoff: runPValueCutoff }));
        const libraryId = library || 'GO_Biological_Process_2023';
        try {
            if (await isOfflineAvailable()) {
                const result = await runOfflinePipeline({
                    upGenes: up_genes,
                    downGenes: down_genes,
                    libraryId,
                    caseName: case_study,
                    contrast,
                    cutoff: runPValueCutoff,
                    jaccardThreshold: parameters.jaccardThreshold,
                });
                if (result.metadata?.empty) {
                    setLayoutJson(null);
                    setInfo('No significant GO terms found. Try a different library or lower the p-value cutoff.');
                } else {
                    applyLayout(result);
                }
                return;
            }
            const response = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    up_genes, down_genes, case_study, contrast,
                    library: libraryId,
                    cutoff: runPValueCutoff,
                    jaccard_threshold: parameters.jaccardThreshold,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`);
            applyLayout(data);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setIsLoading(false);
        }
    }, [parameters.jaccardThreshold]);

    const applyLayout = (json) => {
        setLayoutJson(json);
        setError(null);
        setInfo(null);
        setSelectedId(null);
        const layers = getAvailableLayers(json);
        const defaultLayer = layers.length > 0 ? layers[layers.length - 1] : null;
        setParameters(p => ({
            ...p,
            selectedLayer: defaultLayer,
            maxBlocks: countNodesForLayer(json, defaultLayer, p.pValueCutoff),
            maxEdges: countEdgesForLayer(json, defaultLayer, p.pValueCutoff, p.jaccardThreshold),
        }));
        setDrawerOpen(false);
    };

    // ── Derived: available layers + counts (per-layer) ────────────────
    const availableLayers = useMemo(() => getAvailableLayers(layoutJson), [layoutJson]);
    const layerCounts = useMemo(() => computeLayerCounts(layoutJson, parameters), [layoutJson, parameters.pValueCutoff, parameters.minGenes]);

    // ── Derived: terms + edges in design's shape (bridge real data → prototype shape) ──
    const { terms, edges, upN, downN } = useMemo(() => {
        if (!layoutJson) return { terms: [], edges: [], upN: 0, downN: 0 };
        return bridgeLayoutToDesign(layoutJson, parameters, hierarchy, PLATE_W, PLATE_H);
    }, [layoutJson, parameters, hierarchy]);

    // ── Handlers ──────────────────────────────────────────────────────
    const onLayerChange = useCallback((L) => {
        setSelectedId(null);
        setParameters(p => ({
            ...p,
            selectedLayer: L,
            maxBlocks: countNodesForLayer(layoutJson, L, p.pValueCutoff),
            maxEdges: countEdgesForLayer(layoutJson, L, p.pValueCutoff, p.jaccardThreshold),
        }));
    }, [layoutJson]);

    // ── Keyboard shortcuts ────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.key === 'Escape') { setSelectedId(null); setDrawerOpen(false); }
            if (e.key === '/' || e.key === 'm' || e.key === 'M') { e.preventDefault(); setDrawerOpen(v => !v); }
            if (e.key === '+' || e.key === '=') viewRef.current?.zoomIn();
            if (e.key === '-') viewRef.current?.zoomOut();
            if (e.key === '0') viewRef.current?.reset();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Case label for search pill ────────────────────────────────────
    const caseLabel = layoutJson?.metadata?.case_study || (isLoading ? 'Running enrichment…' : 'No dataset loaded');
    const layerHint = parameters.selectedLayer == null
        ? (availableLayers.length ? 'L1–13' : '—')
        : 'L' + parameters.selectedLayer;

    const selectedTerm = selectedId ? terms.find(t => t.id === selectedId) : null;

    return (
        <div className="map-app" onClick={() => setDrawerOpen(false)}>
            <MapSurface ref={viewRef} plateW={PLATE_W} plateH={PLATE_H}
                onViewChange={(v) => setZoom(v.k)}>
                {terms.length > 0 ? (
                    <MondrianPlate
                        terms={terms}
                        edges={edges}
                        selected={selectedId}
                        onSelect={setSelectedId}
                        showEdges={showEdges}
                        showLabels={showLabels}
                        plateW={PLATE_W}
                        plateH={PLATE_H}
                        zoom={zoom}
                    />
                ) : (
                    <EmptyPlate width={PLATE_W} height={PLATE_H}
                        message={
                            error ? `Error: ${error}` :
                            info ? info :
                            isLoading ? 'Running enrichment…' :
                            'No dataset loaded. Open the menu to paste a gene set and run enrichment.'
                        }
                    />
                )}
            </MapSurface>

            <SearchPill
                caseLabel={caseLabel}
                upN={upN}
                downN={downN}
                visibleCount={terms.length}
                layerHint={layerHint}
                onOpenDrawer={() => setDrawerOpen(true)}
            />
            <TopRightCluster onShowLogin={() => setShowLogin(true)} />

            <MapLegend embedding={embedding} />

            <MapControls
                currentLayer={parameters.selectedLayer}
                availableLayers={availableLayers}
                layerCounts={layerCounts}
                onLayerChange={onLayerChange}
                onZoomIn={() => viewRef.current?.zoomIn()}
                onZoomOut={() => viewRef.current?.zoomOut()}
                onReset={() => viewRef.current?.reset()}
            />

            <LeftDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onRunAnalysis={handleRunAnalysis}
                isLoading={isLoading}
                parameters={parameters}
                onParametersChange={setParameters}
                visibleTerms={terms}
                selectedId={selectedId}
                onSelectTerm={setSelectedId}
                onShowImport={() => { setShowImport(true); setDrawerOpen(false); }}
                showEdges={showEdges}
                showLabels={showLabels}
                onToggleEdges={() => setShowEdges(v => !v)}
                onToggleLabels={() => setShowLabels(v => !v)}
            />

            <DetailDrawer term={selectedTerm} onClose={() => setSelectedId(null)} />

            <ImportModal open={showImport}
                onClose={() => setShowImport(false)}
                onFinish={() => setShowImport(false)} />
            <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// Empty plate — shown when there is no enrichment result yet.
// ────────────────────────────────────────────────────────────────────────
function EmptyPlate({ width, height, message }) {
    return (
        <svg viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block', width: '100%', height: '100%' }}>
            <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
            <rect x={30} y={30} width={width - 60} height={height - 60}
                fill="none" stroke="#e7e6e2" strokeWidth={1} shapeRendering="crispEdges" />
            <g transform={`translate(${width / 2}, ${height / 2 - 60})`}>
                <g transform="translate(-40, -40)">
                    <rect x={0} y={0} width={38} height={38} fill="#E63946" stroke="#111" strokeWidth={1.5} />
                    <rect x={42} y={0} width={38} height={38} fill="#FFC928" stroke="#111" strokeWidth={1.5} />
                    <rect x={0} y={42} width={38} height={38} fill="#1D4ED8" stroke="#111" strokeWidth={1.5} />
                    <rect x={42} y={42} width={38} height={38} fill="#ffffff" stroke="#111" strokeWidth={1.5} />
                </g>
                <text x={0} y={80} fontSize={22} fontFamily="var(--display)" fontWeight={600}
                    fill="#111" textAnchor="middle">Mondrian Map</text>
                <text x={0} y={120} fontSize={14} fontFamily="var(--display)" fontWeight={400}
                    fill="#5c5c63" textAnchor="middle">
                    <tspan>{message}</tspan>
                </text>
            </g>
        </svg>
    );
}

// ────────────────────────────────────────────────────────────────────────
// Data bridge: existing layoutJson → design-shaped terms & edges.
// Ports the relevant parts of the old mapRealDataToEntities, adjusted to
// emit { id, name, layer, logp, n, dir, genes, x, y } in [0,1] coords.
// ────────────────────────────────────────────────────────────────────────
function bridgeLayoutToDesign(layoutJson, parameters, hierarchy, plateW, plateH) {
    const { selectedLayer, pValueCutoff, jaccardThreshold, maxBlocks, maxEdges, minGenes } = parameters;

    // 1. Filter real nodes for current layer
    let nodes = layoutJson.nodes.filter(n =>
        (selectedLayer == null || n.layer === selectedLayer) &&
        n.adjusted_p_value <= pValueCutoff &&
        (n.gene_count ?? (n.genes?.length ?? 0)) >= (minGenes ?? 1)
    );
    nodes.sort((a, b) => (b.significance_score ?? 0) - (a.significance_score ?? 0));
    if (maxBlocks) nodes = nodes.slice(0, maxBlocks);

    if (nodes.length === 0) return { terms: [], edges: [], upN: 0, downN: 0 };

    // 2. Figure out the extent of node grid_coords to normalize to [0,1]
    const xs = nodes.map(n => n.grid_coords?.x ?? 500);
    const ys = nodes.map(n => n.grid_coords?.y ?? 500);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    const terms = nodes.map(n => {
        const logp = -Math.log10(Math.max(1e-20, n.adjusted_p_value || 1));
        const dir = n.direction === 'upregulated' ? 1
            : n.direction === 'downregulated' ? -1
            : 0;
        // Normalize grid_coords into [0.05, 0.95] to keep margin off the plate edge
        const nx = spanX > 1 ? 0.05 + 0.9 * ((n.grid_coords?.x ?? 500) - minX) / spanX : 0.5;
        const ny = spanY > 1 ? 0.05 + 0.9 * ((n.grid_coords?.y ?? 500) - minY) / spanY : 0.5;
        return {
            id: `GO:${n.go_id}`.replace(/^GO:GO:/, 'GO:'),
            name: n.name,
            layer: n.layer,
            logp,
            n: n.gene_count ?? (n.genes?.length ?? 0),
            dir,
            genes: n.genes || [],
            x: nx,
            y: ny,
        };
    });

    // 3. Edges
    const nodeIds = new Set(terms.map(t => t.id));
    const normalize = (id) => id.startsWith('GO:') ? id : `GO:${id}`;
    let rawEdges = (layoutJson.edges || []).filter(e => {
        const s = normalize(e.source);
        const t = normalize(e.target);
        return nodeIds.has(s) && nodeIds.has(t) && e.weight >= (jaccardThreshold ?? 0.15);
    });
    rawEdges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    if (maxEdges) rawEdges = rawEdges.slice(0, maxEdges);
    const edges = rawEdges.map(e => [normalize(e.source), normalize(e.target), e.weight ?? 0.4]);

    // 4. Up/down counts (for search pill chip)
    let upN = 0, downN = 0;
    for (const t of terms) { if (t.dir > 0) upN++; else if (t.dir < 0) downN++; }

    return { terms, edges, upN, downN };
}

function getAvailableLayers(layoutJson) {
    if (!layoutJson?.nodes) return [];
    const layers = new Set(layoutJson.nodes.map(n => n.layer).filter(l => l > 0));
    return [...layers].sort((a, b) => a - b);
}

function countNodesForLayer(layoutJson, layer, pValueCutoff) {
    if (!layoutJson?.nodes) return 0;
    return layoutJson.nodes.filter(n =>
        (layer == null ? true : n.layer === layer) &&
        n.adjusted_p_value <= pValueCutoff
    ).length;
}

function countEdgesForLayer(layoutJson, layer, pValueCutoff, jaccardThreshold) {
    if (!layoutJson?.nodes || !layoutJson?.edges) return 0;
    const ids = new Set(
        layoutJson.nodes
            .filter(n => (layer == null ? true : n.layer === layer) && n.adjusted_p_value <= pValueCutoff)
            .map(n => n.go_id)
    );
    return layoutJson.edges.filter(e => {
        const s = e.source.replace(/^GO:/, '');
        const t = e.target.replace(/^GO:/, '');
        return ids.has(s) && ids.has(t) && e.weight >= jaccardThreshold;
    }).length;
}

function computeLayerCounts(layoutJson, parameters) {
    const out = {};
    for (let L = 1; L <= 13; L++) out[L] = { up: 0, down: 0, total: 0 };
    if (!layoutJson?.nodes) return out;
    const minGenes = parameters.minGenes ?? 1;
    const pCutoff = parameters.pValueCutoff ?? 0.05;
    for (const n of layoutJson.nodes) {
        if (n.adjusted_p_value > pCutoff) continue;
        if ((n.gene_count ?? (n.genes?.length ?? 0)) < minGenes) continue;
        const bucket = out[n.layer];
        if (!bucket) continue;
        bucket.total++;
        if (n.direction === 'upregulated') bucket.up++;
        else if (n.direction === 'downregulated') bucket.down++;
    }
    return out;
}

export default App;
