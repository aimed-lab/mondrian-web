import React, { useCallback, useMemo } from 'react';
import { Plus, Minus, Layers } from 'lucide-react';

/**
 * Google Maps–style vertical layer zoom control.
 *
 * Placed on the right side of the Mondrian Map:
 *   + (zoom in)  → decreases layer number (more detail / child terms)
 *   - (zoom out) → increases layer number (less detail / parent terms)
 *
 * Between the buttons: a vertical slider with layer-availability dots.
 * Below: an "All" button to show all layers combined.
 *
 * Props:
 *   currentLayer     – currently selected layer number (null = all)
 *   availableLayers  – sorted array of available layer numbers (ascending)
 *   onLayerChange    – callback(newLayer)  — newLayer can be null for "All"
 *   allLayers        – total range of layers [1..N] (for showing availability)
 */
const LayerZoomControl = ({
    currentLayer,
    availableLayers = [],
    onLayerChange,
    allLayers = 13,
    defaultLayer = null,  // highest available layer to return to when toggling "All" off
}) => {
    const lo = 1;
    const hi = allLayers;

    const availableSet = useMemo(() => new Set(availableLayers), [availableLayers]);

    // Find next available layer in a direction
    const findNextAvailable = useCallback((from, direction) => {
        let next = from + direction;
        while (next >= lo && next <= hi) {
            if (availableSet.has(next)) return next;
            next += direction;
        }
        return null;
    }, [lo, hi, availableSet]);

    const canZoomIn = currentLayer !== null && findNextAvailable(currentLayer, -1) !== null;
    const canZoomOut = currentLayer !== null && findNextAvailable(currentLayer, 1) !== null;

    const handleZoomIn = useCallback(() => {
        if (currentLayer === null) {
            // From "All", go to highest available layer
            if (availableLayers.length > 0) onLayerChange(availableLayers[availableLayers.length - 1]);
            return;
        }
        const next = findNextAvailable(currentLayer, -1);
        if (next !== null) onLayerChange(next);
    }, [currentLayer, findNextAvailable, onLayerChange, availableLayers]);

    const handleZoomOut = useCallback(() => {
        if (currentLayer === null) return;
        const next = findNextAvailable(currentLayer, 1);
        if (next !== null) onLayerChange(next);
    }, [currentLayer, findNextAvailable, onLayerChange]);

    const handleSliderChange = useCallback((e) => {
        // Slider is rotated: min (left/top visually) = hi (zoom out), max (right/bottom) = lo (zoom in)
        // Raw slider value goes from lo to hi
        const raw = parseInt(e.target.value, 10);
        // Invert: slider value lo → layer hi, slider value hi → layer lo
        const layer = hi - raw + lo;
        // Snap to nearest available layer
        if (availableSet.has(layer)) {
            onLayerChange(layer);
        } else {
            let best = null;
            let bestDist = Infinity;
            for (const l of availableLayers) {
                const d = Math.abs(l - layer);
                if (d < bestDist) { bestDist = d; best = l; }
            }
            if (best !== null) onLayerChange(best);
        }
    }, [lo, hi, availableSet, availableLayers, onLayerChange]);

    const handleAllClick = useCallback(() => {
        if (currentLayer === null) {
            // Toggle off: go back to highest available layer (or provided default)
            const fallback = defaultLayer ?? (availableLayers.length > 0 ? availableLayers[availableLayers.length - 1] : null);
            onLayerChange(fallback);
        } else {
            // Toggle on: show all layers
            onLayerChange(null);
        }
    }, [currentLayer, defaultLayer, availableLayers, onLayerChange]);

    if (availableLayers.length === 0) return null;

    // Slider value (inverted): layer hi → slider lo, layer lo → slider hi
    const sliderValue = currentLayer === null
        ? lo  // All layers: put slider at top (zoomed out)
        : hi - currentLayer + lo;

    // All layer numbers for the dot indicators
    const layerNums = Array.from({ length: hi }, (_, i) => i + 1);

    // Height for the track area — scale with number of layers
    const trackHeight = Math.max(140, hi * 18);
    // The slider input needs a width equal to trackHeight since we rotate it
    const sliderInputWidth = trackHeight;

    return (
        <div className="flex flex-col items-center gap-0 bg-white/90 backdrop-blur-sm rounded-md shadow-lg border border-gray-200 p-1.5" style={{ userSelect: 'none' }}>
            {/* Layer label */}
            <div className="mb-1.5 text-center">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Layer</span>
                <div className="text-base font-mono font-bold text-black leading-tight mt-0.5">
                    {currentLayer === null ? 'All' : currentLayer}
                </div>
            </div>

            {/* + button (zoom in = lower layer = more detail) */}
            <button
                onClick={handleZoomIn}
                disabled={currentLayer !== null && !canZoomIn}
                className={[
                    'w-8 h-8 flex items-center justify-center',
                    'border border-gray-300 rounded-t-sm border-b-0',
                    'transition-colors bg-white',
                    (currentLayer === null || canZoomIn)
                        ? 'hover:bg-gray-100 hover:border-black text-gray-700 cursor-pointer'
                        : 'text-gray-300 cursor-not-allowed',
                ].join(' ')}
                title="Zoom in (more detail)"
            >
                <Plus size={14} strokeWidth={2.5} />
            </button>

            {/* Slider track with layer dots */}
            <div
                className="relative bg-white border border-gray-300 flex items-center justify-center"
                style={{ width: '32px', height: `${trackHeight}px` }}
            >
                {/* Layer availability dots — positioned absolutely along the track */}
                <div className="absolute inset-0 flex flex-col justify-between py-2 pointer-events-none" style={{ zIndex: 1 }}>
                    {layerNums.slice().reverse().map(layer => {
                        const hasData = availableSet.has(layer);
                        const isActive = layer === currentLayer;
                        return (
                            <div key={layer} className="flex items-center justify-center w-full relative">
                                {/* Tick mark */}
                                <div
                                    className={[
                                        'rounded-full transition-all',
                                        isActive
                                            ? 'w-2.5 h-2.5 bg-black ring-2 ring-black/20'
                                            : hasData
                                                ? 'w-1.5 h-1.5 bg-gray-500'
                                                : 'w-1 h-1 bg-gray-200',
                                    ].join(' ')}
                                />
                                {/* Layer number label on the left */}
                                <span
                                    className={[
                                        'absolute text-[8px] font-mono leading-none',
                                        isActive ? 'font-bold text-black' : hasData ? 'text-gray-400' : 'text-gray-200',
                                    ].join(' ')}
                                    style={{ right: '100%', marginRight: '4px', whiteSpace: 'nowrap' }}
                                >
                                    {layer}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Actual range slider — rotated 90° to be vertical */}
                <input
                    type="range"
                    min={lo}
                    max={hi}
                    step={1}
                    value={sliderValue}
                    onChange={handleSliderChange}
                    className="layer-zoom-slider"
                    style={{
                        position: 'absolute',
                        width: `${trackHeight - 16}px`,
                        height: '20px',
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'center center',
                        zIndex: 2,
                        cursor: 'pointer',
                        margin: 0,
                        padding: 0,
                        opacity: 0.01,  /* invisible but functional — dots act as visual */
                    }}
                    title={`Layer ${currentLayer === null ? 'All' : currentLayer}`}
                />

                {/* Visible track line */}
                <div
                    className="absolute bg-gray-200 rounded-full"
                    style={{ width: '3px', top: '8px', bottom: '8px', zIndex: 0 }}
                />
            </div>

            {/* - button (zoom out = higher layer = less detail) */}
            <button
                onClick={handleZoomOut}
                disabled={currentLayer === null || !canZoomOut}
                className={[
                    'w-8 h-8 flex items-center justify-center',
                    'border border-gray-300 rounded-b-sm border-t-0',
                    'transition-colors bg-white',
                    (currentLayer !== null && canZoomOut)
                        ? 'hover:bg-gray-100 hover:border-black text-gray-700 cursor-pointer'
                        : 'text-gray-300 cursor-not-allowed',
                ].join(' ')}
                title="Zoom out (less detail)"
            >
                <Minus size={14} strokeWidth={2.5} />
            </button>

            {/* All Layers button */}
            <button
                onClick={handleAllClick}
                className={[
                    'w-8 h-8 flex items-center justify-center mt-2',
                    'border rounded-sm transition-colors',
                    currentLayer === null
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100 hover:border-black hover:text-black',
                ].join(' ')}
                title="Show all layers"
            >
                <Layers size={13} strokeWidth={2} />
            </button>

            {/* Custom slider styling — not visible but keeps browser behavior consistent */}
            <style>{`
                .layer-zoom-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    background: transparent;
                }
                .layer-zoom-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: black;
                    cursor: pointer;
                }
                .layer-zoom-slider::-webkit-slider-runnable-track {
                    background: transparent;
                    height: 4px;
                }
                .layer-zoom-slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: black;
                    border: none;
                    cursor: pointer;
                }
                .layer-zoom-slider::-moz-range-track {
                    background: transparent;
                    height: 4px;
                }
            `}</style>
        </div>
    );
};

export default LayerZoomControl;
