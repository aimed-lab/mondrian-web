import React, { useCallback, useMemo } from 'react';
import { Plus, Minus, Layers } from 'lucide-react';

const LayerZoomControl = ({
    currentLayer,
    availableLayers = [],
    onLayerChange,
    allLayers = 13,
    defaultLayer = null,
}) => {
    const lo = 1;
    const hi = allLayers;

    const availableSet = useMemo(() => new Set(availableLayers), [availableLayers]);

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

    const handleAllClick = useCallback(() => {
        if (currentLayer === null) {
            const fallback = defaultLayer ?? (availableLayers.length > 0 ? availableLayers[availableLayers.length - 1] : null);
            onLayerChange(fallback);
        } else {
            onLayerChange(null);
        }
    }, [currentLayer, defaultLayer, availableLayers, onLayerChange]);

    if (availableLayers.length === 0) return null;

    // Drawing pyramid
    const W = 80;
    const H = 100;
    
    const slices = [];
    for (let L = hi; L >= 1; L--) {
        const isAvailable = availableSet.has(L);
        const isActive = currentLayer === null ? isAvailable : (currentLayer === L);
        
        const idx = hi - L;
        
        const sliceH = (H / hi);
        const gap = 1.5;
        const yTop = idx * sliceH;
        const yBottom = (idx + 1) * sliceH - gap;
        
        // Triangle tip at idx=0 is width 6, bot is W
        const topRatio = idx / hi;
        const botRatio = (idx + 1) / hi;
        
        const wTop = 6 + (W - 6) * topRatio;
        const wBottom = 6 + (W - 6) * botRatio;
        
        const xTopLeft = (W - wTop) / 2;
        const xTopRight = W - xTopLeft;
        
        const xBotLeft = (W - wBottom) / 2;
        const xBotRight = W - xBotLeft;

        const path = `M ${xTopLeft} ${yTop} L ${xTopRight} ${yTop} L ${xBotRight} ${yBottom} L ${xBotLeft} ${yBottom} Z`;

        let fillClass = isActive ? 'fill-gray-700' : isAvailable ? 'fill-gray-300' : 'fill-gray-100';
        
        slices.push(
            <path
                key={L}
                d={path}
                className={`transition-colors duration-200 ${fillClass} ${isAvailable ? 'hover:fill-gray-500 cursor-pointer' : ''}`}
                onClick={() => isAvailable && onLayerChange(L)}
            />
        );
    }

    return (
        <div className="flex flex-row items-end gap-3 bg-white border border-gray-300 shadow-md p-2 rounded-lg opacity-30 hover:opacity-[0.85] transition-opacity duration-300 pointer-events-auto" style={{ userSelect: 'none' }}>
            {/* Pyramid graphic */}
            <div className="relative flex flex-col items-center justify-center pl-4 pr-1 mb-1">
                {/* Label 13 at top left */}
                <span className="absolute top-[-4px] left-[0px] text-[10px] font-bold text-gray-500">{hi}</span>
                {/* Label 1 at bottom left */}
                <span className="absolute bottom-[0px] left-[6px] text-[10px] font-bold text-gray-500">1</span>
                
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible block">
                    {slices}
                </svg>
            </div>

            {/* UI Buttons */}
            <div className="flex flex-col items-center gap-0">
                <button
                    onClick={handleZoomIn}
                    disabled={currentLayer !== null && !canZoomIn}
                    className={[
                        'w-8 h-8 flex items-center justify-center',
                        'border border-gray-300 rounded-t-md border-b-0',
                        'transition-colors bg-white',
                        (currentLayer === null || canZoomIn)
                            ? 'hover:bg-gray-100 hover:border-black text-gray-700 cursor-pointer'
                            : 'text-gray-300 cursor-not-allowed',
                    ].join(' ')}
                    title="Zoom in (more detail / lower layer)"
                >
                    <Plus size={16} strokeWidth={2.5} />
                </button>
                
                <button
                    onClick={handleZoomOut}
                    disabled={currentLayer === null || !canZoomOut}
                    className={[
                        'w-8 h-8 flex items-center justify-center',
                        'border border-gray-300 rounded-b-md',
                        'transition-colors bg-white',
                        (currentLayer !== null && canZoomOut)
                            ? 'hover:bg-gray-100 hover:border-black text-gray-700 cursor-pointer'
                            : 'text-gray-300 cursor-not-allowed',
                    ].join(' ')}
                    title="Zoom out (less detail / higher layer)"
                >
                    <Minus size={16} strokeWidth={2.5} />
                </button>

                <button
                    onClick={handleAllClick}
                    className={[
                        'w-8 h-8 flex items-center justify-center mt-2',
                        'border rounded-md transition-colors shadow-sm',
                        currentLayer === null
                            ? 'bg-black text-white border-black'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100 hover:border-black hover:text-black',
                    ].join(' ')}
                    title="Show all layers"
                >
                    <Layers size={14} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
};

export default LayerZoomControl;
