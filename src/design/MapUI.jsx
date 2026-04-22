import React, { useEffect, useState } from 'react';

// ────────────────────────────────────────────────────────────────────────
// SearchPill — top-left Google-Maps-style pill with hamburger + case chip
// ────────────────────────────────────────────────────────────────────────
export function SearchPill({ caseLabel, upN, downN, visibleCount, layerHint, onOpenDrawer }) {
    return (
        <div className="search-pill" onClick={(e) => e.stopPropagation()}>
            <button className="menu-btn" onClick={onOpenDrawer} title="Open menu (M)">
                <span className="bars"><i /><i /><i /></span>
            </button>
            <div className="case-chip" onClick={onOpenDrawer}>
                <div className="title">{caseLabel}</div>
                <div className="sub">
                    {upN}↑ {downN}↓ · {visibleCount} GO · {layerHint}
                </div>
            </div>
            <button className="search-icon" title="Search terms" onClick={onOpenDrawer}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
            </button>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// TopRightCluster — just the user avatar (no login wiring yet)
// ────────────────────────────────────────────────────────────────────────
export function TopRightCluster({ onShowLogin }) {
    return (
        <div className="topright">
            <button className="fab round" title="Sign in (optional)" onClick={onShowLogin}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            </button>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// MapControls — bottom-right: layer button (popup) + compass + zoom stack
// ────────────────────────────────────────────────────────────────────────
export function MapControls({
    currentLayer, availableLayers, layerCounts,
    onLayerChange, onZoomIn, onZoomOut, onReset,
}) {
    const [layersOpen, setLayersOpen] = useState(false);

    useEffect(() => {
        if (!layersOpen) return;
        const h = () => setLayersOpen(false);
        const t = setTimeout(() => document.addEventListener('click', h, { once: true }), 0);
        return () => { clearTimeout(t); document.removeEventListener('click', h); };
    }, [layersOpen]);

    const layerHint = currentLayer == null ? 'All' : 'L' + currentLayer;

    return (
        <div className="br-cluster" onClick={(e) => e.stopPropagation()}>
            <div style={{ position: 'relative' }}>
                <button
                    className={'map-btn' + (layersOpen ? ' on' : '')}
                    title="GOALS layer"
                    onClick={(e) => { e.stopPropagation(); setLayersOpen(o => !o); }}
                >
                    <LayerIcon />
                    <span className="badge">{layerHint}</span>
                </button>
                {layersOpen && (
                    <LayerPopup
                        currentLayer={currentLayer}
                        availableLayers={availableLayers}
                        layerCounts={layerCounts}
                        onChange={(L) => { onLayerChange(L); }}
                    />
                )}
            </div>

            <button className="map-btn" title="Fit to view (0)" onClick={onReset}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M12 4 L14 12 L12 20 L10 12 Z" fill="#d7261e" stroke="#111" strokeWidth="0.6" />
                </svg>
            </button>

            <div className="zoom-stack">
                <button onClick={onZoomIn} title="Zoom in (+)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
                <button onClick={onZoomOut} title="Zoom out (−)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

function LayerIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 3 22 9 12 15 2 9 12 3" />
            <polyline points="2 15 12 21 22 15" />
        </svg>
    );
}

// ────────────────────────────────────────────────────────────────────────
// LayerPopup — the GOALS pyramid, pops above the Layer button
// ────────────────────────────────────────────────────────────────────────
function LayerPopup({ currentLayer, availableLayers, layerCounts, onChange }) {
    const allLayers = 13;
    const availSet = new Set(availableLayers);
    const isAllMode = currentLayer == null;

    const layerHints = {
        1: 'molecular', 2: 'reaction', 3: 'complex', 4: 'pathway step',
        5: 'pathway', 6: 'organelle', 7: 'defense', 8: 'cellular',
        9: 'tissue', 10: 'multi-cellular', 11: 'regulatory', 12: 'system', 13: 'umbrella',
    };

    const W = 180, H = 120;
    const slices = [];
    for (let L = allLayers; L >= 1; L--) {
        const idx = allLayers - L;
        const sliceH = H / allLayers;
        const gap = 1.5;
        const yTop = idx * sliceH;
        const yBottom = (idx + 1) * sliceH - gap;
        const topRatio = idx / allLayers;
        const botRatio = (idx + 1) / allLayers;
        const wTop = 12 + (W - 12) * topRatio;
        const wBottom = 12 + (W - 12) * botRatio;
        const xTopLeft = (W - wTop) / 2;
        const xTopRight = W - xTopLeft;
        const xBotLeft = (W - wBottom) / 2;
        const xBotRight = W - xBotLeft;
        const path = `M ${xTopLeft} ${yTop} L ${xTopRight} ${yTop} L ${xBotRight} ${yBottom} L ${xBotLeft} ${yBottom} Z`;
        const avail = availSet.has(L);
        const active = isAllMode ? avail : (currentLayer === L);
        const fill = active ? '#111' : avail ? '#d6d3c9' : '#efece3';
        const count = layerCounts[L]?.total || 0;
        slices.push(
            <g key={L}>
                <path d={path} fill={fill}
                    stroke={active ? '#111' : 'transparent'} strokeWidth="0.6"
                    style={{ cursor: avail ? 'pointer' : 'not-allowed', transition: 'fill .15s' }}
                    onClick={() => avail && onChange(L)}
                >
                    <title>Layer {L} — {layerHints[L]} · {count} terms</title>
                </path>
                <text x={W + 4} y={yTop + sliceH / 2 + 3} fontSize="8"
                    fill={active ? '#111' : '#8a8a92'}
                    fontFamily="var(--mono)" fontWeight={active ? 700 : 400}>
                    L{L}
                </text>
            </g>
        );
    }

    return (
        <div className="layer-popup" onClick={(e) => e.stopPropagation()}>
            <h4>GOALS Layer</h4>
            <div className="current">
                {isAllMode ? 'All 13' : `L${currentLayer}`}
                <span className="kind">
                    {isAllMode ? 'overview' : layerHints[currentLayer]}
                </span>
            </div>
            <div className="pyramid-wrap">
                <svg width={W + 28} height={H + 4} viewBox={`0 0 ${W + 28} ${H + 4}`}>
                    {slices}
                </svg>
            </div>
            <button
                className={'show-all ' + (isAllMode ? 'on' : '')}
                onClick={() => onChange(isAllMode
                    ? (availableLayers[availableLayers.length - 1] ?? null)
                    : null)}
            >
                {isAllMode ? 'Focus a layer →' : 'Show all 13 layers'}
            </button>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// MapLegend — bottom-left: help button + scale bar + attribution
// ────────────────────────────────────────────────────────────────────────
export function MapLegend({ embedding }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const h = () => setOpen(false);
        const t = setTimeout(() => document.addEventListener('click', h, { once: true }), 0);
        return () => { clearTimeout(t); document.removeEventListener('click', h); };
    }, [open]);

    const embLabel = (embedding || 'gobert_umap').split('_')[0].toUpperCase();

    return (
        <div className="bl-cluster" onClick={(e) => e.stopPropagation()}>
            <div style={{ position: 'relative' }}>
                <button
                    className={'map-btn' + (open ? ' on' : '')}
                    title="Legend"
                    onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                </button>
                {open && (
                    <div className="legend-popup" onClick={(e) => e.stopPropagation()}>
                        <h4>Blocks</h4>
                        <div className="row"><span className="sw" style={{ background: '#E63946' }} /> Upregulated pathway</div>
                        <div className="row"><span className="sw" style={{ background: '#1D4ED8' }} /> Downregulated pathway</div>
                        <div className="row"><span className="sw" style={{ background: '#FFC928' }} /> Neutral / shared</div>
                        <div className="divider" />
                        <h4>Crosstalk edges</h4>
                        <div className="row"><span className="ln" style={{ background: '#E63946' }} /> Up ↔ up</div>
                        <div className="row"><span className="ln" style={{ background: '#1D4ED8' }} /> Down ↔ down</div>
                        <div className="row"><span className="ln" style={{ background: '#E8A82B' }} /> Mixed / neutral</div>
                        <div className="note">
                            Block size ∝ −log₁₀p · Edge width ∝ Jaccard · Position = {(embedding || 'gobert_umap').replace('_', '·')}
                        </div>
                    </div>
                )}
            </div>
            <div className="scale-bar">
                <span>0</span>
                <span className="bar"><i /><i /><i /><i /></span>
                <span>−log₁₀p</span>
            </div>
            <div className="attribution">© MONDRIAN MAP · {embLabel}</div>
        </div>
    );
}
