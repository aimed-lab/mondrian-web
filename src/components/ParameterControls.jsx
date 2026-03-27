import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

const DEFAULTS = {
    selectedLayer: null,
    maxBlocks: 9999,
    maxEdges: 9999,
    pValueCutoff: 0.05,
    jaccardThreshold: 0.15,
    blockSizeMultiplier: 1.0,
    blockSpacing: 5,
};

// ---------------------------------------------------------------------------
// SliderWithInput
// ---------------------------------------------------------------------------
const SliderWithInput = ({
    label,
    sublabel,
    value,
    min,
    max,
    step,
    onChange,
    unit = '',
    disabled = false,
    isFloat = false,
    maxLabel,          // optional "/ N" shown to the right of the input
}) => {
    const fmt = (v) =>
        isFloat ? parseFloat(v).toFixed(step < 0.01 ? 3 : 2) : String(Math.round(v));

    const [draft, setDraft] = useState(fmt(value));

    useEffect(() => {
        setDraft(fmt(value));
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const commit = (raw) => {
        const parsed = isFloat ? parseFloat(raw) : parseInt(raw, 10);
        if (isNaN(parsed)) { setDraft(fmt(value)); return; }
        const clamped = Math.max(min, Math.min(max, parsed));
        onChange(isFloat ? parseFloat(clamped.toFixed(10)) : clamped);
        setDraft(fmt(clamped));
    };

    const sliderVal = Math.max(min, Math.min(max, value));

    // Adaptive input width: enough characters for the current draft value
    const inputWidth = `${Math.max(2, draft.toString().length) + 1.2}ch`;

    const sliderCls = [
        'w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-black',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
    ].join(' ');

    // Hide number-input spin buttons
    const inputCls = [
        'text-sm font-mono text-right border border-gray-300 px-2 py-1 rounded-none',
        'focus:outline-none focus:border-black bg-white',
        'disabled:opacity-40',
        // Remove spin buttons (webkit + firefox)
        '[appearance:textfield]',
        '[&::-webkit-inner-spin-button]:appearance-none',
        '[&::-webkit-outer-spin-button]:appearance-none',
    ].join(' ');

    return (
        <div className="flex flex-col gap-2">
            {/* Label + input row */}
            <div className="flex justify-between items-start gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <label className="text-sm font-semibold text-gray-900 leading-tight">{label}</label>
                    {sublabel && (
                        <span className="text-xs text-gray-500 leading-snug">{sublabel}</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <input
                        type="number"
                        value={draft}
                        min={min}
                        max={max}
                        step={step}
                        disabled={disabled}
                        style={{ width: inputWidth }}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={e => commit(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') commit(e.target.value);
                            if (e.key === 'Escape') setDraft(fmt(value));
                        }}
                        className={inputCls}
                    />
                    {unit && (
                        <span className="text-sm text-gray-500 font-mono">{unit}</span>
                    )}
                    {maxLabel && (
                        <span className="text-sm text-gray-400 font-mono">{maxLabel}</span>
                    )}
                </div>
            </div>
            {/* Slider */}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={sliderVal}
                disabled={disabled}
                onChange={e => {
                    const v = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                    onChange(v);
                    setDraft(fmt(v));
                }}
                className={sliderCls}
            />
            {/* Range bounds */}
            <div className="flex justify-between text-xs text-gray-400 font-mono">
                <span>{fmt(min)}{unit}</span>
                <span>{fmt(max)}{unit}</span>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// ParameterControls
// ---------------------------------------------------------------------------
const ParameterControls = ({
    parameters,
    onParametersChange,
    nodeCount = 0,
    edgeCount = 0,
    availableLayers = [],
    layerNodeCounts = {},
    layerEdgeCounts = {},
}) => {
    const [open, setOpen] = useState(true);
    const availableSet = new Set(availableLayers);
    const currentLayer = parameters.selectedLayer;

    const maxLayer = availableLayers.length > 0 ? Math.max(...availableLayers) : 0;
    const allLayerNums = maxLayer > 0 ? Array.from({ length: maxLayer }, (_, i) => i + 1) : [];

    const handleChange = useCallback(
        (key, value) => onParametersChange({ ...parameters, [key]: value }),
        [parameters, onParametersChange]
    );

    const handleLayerClick = useCallback((layer) => {
        if (layer !== null && !availableSet.has(layer)) return;
        const nc = layerNodeCounts[layer] ?? nodeCount;
        const ec = layerEdgeCounts[layer] ?? edgeCount;
        onParametersChange({ ...parameters, selectedLayer: layer, maxBlocks: nc, maxEdges: ec });
    }, [parameters, onParametersChange, availableSet, layerNodeCounts, layerEdgeCounts, nodeCount, edgeCount]);

    const handleReset = useCallback(() => {
        const defaultLayer = availableLayers.length > 0 ? availableLayers[0] : null;
        const nc = layerNodeCounts[defaultLayer] ?? nodeCount;
        const ec = layerEdgeCounts[defaultLayer] ?? edgeCount;
        onParametersChange({ ...DEFAULTS, selectedLayer: defaultLayer, maxBlocks: nc, maxEdges: ec });
    }, [onParametersChange, nodeCount, edgeCount, availableLayers, layerNodeCounts, layerEdgeCounts]);

    const displayedBlocks = Math.min(parameters.maxBlocks, nodeCount);
    const displayedEdges  = Math.min(parameters.maxEdges,  edgeCount);

    const layerBtnCls = (layer) => {
        const available = layer === null ? availableLayers.length > 0 : availableSet.has(layer);
        const selected  = currentLayer === layer;
        const base = 'min-w-[2.25rem] px-2.5 py-1.5 text-xs font-bold rounded-none border-2 transition-colors';
        if (!available) return `${base} border-gray-200 text-gray-300 cursor-not-allowed select-none`;
        if (selected)   return `${base} bg-black text-white border-black`;
        return `${base} bg-white text-gray-800 border-gray-300 hover:border-black hover:text-black`;
    };

    const sep = <hr className="border-gray-100" />;

    return (
        <div className="bg-white p-5 shadow-lg border-2 border-black w-full rounded-none">
            {/* Header — no icon */}
            <div
                className="flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-5 -my-5 p-5"
                onClick={() => setOpen(o => !o)}
            >
                <h2 className="text-base font-bold text-black tracking-wide">Visualization Controls</h2>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>

            {open && (
                <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col gap-6">

                    {/* ── GO Hierarchy Layer ── */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold text-gray-900">GO Hierarchy Layer</label>
                            <span className="text-sm font-mono text-gray-600">
                                {currentLayer === null ? 'All Layers' : `Layer ${currentLayer}`}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {allLayerNums.map(layer => (
                                <button
                                    key={layer}
                                    disabled={!availableSet.has(layer)}
                                    onClick={() => handleLayerClick(layer)}
                                    className={layerBtnCls(layer)}
                                    title={!availableSet.has(layer) ? 'No GO terms in this layer' : `Show Layer ${layer}`}
                                >
                                    {layer}
                                </button>
                            ))}
                            <button
                                disabled={availableLayers.length === 0}
                                onClick={() => handleLayerClick(null)}
                                className={layerBtnCls(null)}
                                title="Show all hierarchy layers"
                            >
                                All
                            </button>
                        </div>
                        {availableLayers.length === 0 && (
                            <p className="text-xs text-gray-500 italic">Run an enrichment analysis to see layers.</p>
                        )}
                    </div>

                    {sep}

                    {/* ── # GO Terms ── */}
                    <SliderWithInput
                        label="# GO Terms"
                        sublabel="Top enriched biological processes to display"
                        value={displayedBlocks}
                        min={1}
                        max={Math.max(1, nodeCount)}
                        step={1}
                        onChange={v => handleChange('maxBlocks', v)}
                        disabled={nodeCount === 0}
                        maxLabel={`/ ${nodeCount}`}
                    />

                    {/* ── # Crosstalks ── */}
                    <SliderWithInput
                        label="# Crosstalks"
                        sublabel="Gene-overlap edges between GO terms (Jaccard ≥ threshold)"
                        value={displayedEdges}
                        min={0}
                        max={Math.max(0, edgeCount)}
                        step={1}
                        onChange={v => handleChange('maxEdges', v)}
                        disabled={edgeCount === 0}
                        maxLabel={`/ ${edgeCount}`}
                    />

                    {sep}

                    {/* ── Adj. P-value Cutoff ── */}
                    <SliderWithInput
                        label="Adj. P-value Cutoff"
                        sublabel="Show GO terms with adjusted p-value ≤ threshold"
                        value={parameters.pValueCutoff}
                        min={0.001}
                        max={0.5}
                        step={0.001}
                        onChange={v => handleChange('pValueCutoff', v)}
                        isFloat
                    />

                    {/* ── Min. Jaccard Index ── */}
                    <SliderWithInput
                        label="Min. Jaccard Index"
                        sublabel="Minimum gene-set overlap for crosstalk edges"
                        value={parameters.jaccardThreshold}
                        min={0.0}
                        max={1.0}
                        step={0.01}
                        onChange={v => handleChange('jaccardThreshold', v)}
                        isFloat
                    />

                    {sep}

                    {/* ── Block Size ── */}
                    <SliderWithInput
                        label="Block Size"
                        sublabel="Scale factor for GO term block area"
                        value={parameters.blockSizeMultiplier}
                        min={0.3}
                        max={3.0}
                        step={0.1}
                        onChange={v => handleChange('blockSizeMultiplier', v)}
                        unit="×"
                        isFloat
                    />

                    {/* ── Block Spacing ── */}
                    <SliderWithInput
                        label="Block Spacing"
                        sublabel="Minimum padding between blocks"
                        value={parameters.blockSpacing}
                        min={0}
                        max={30}
                        step={1}
                        onChange={v => handleChange('blockSpacing', v)}
                        unit="px"
                    />

                    {/* Reset */}
                    <button
                        onClick={handleReset}
                        className="w-full bg-gray-100 text-gray-800 py-2 px-4 hover:bg-gray-200 flex items-center justify-center gap-2 font-semibold transition-colors rounded-none text-sm border border-gray-300"
                    >
                        <RotateCcw size={14} />
                        Reset to Defaults
                    </button>
                </div>
            )}
        </div>
    );
};

export { DEFAULTS as PARAMETER_DEFAULTS };
export default ParameterControls;
