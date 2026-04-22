import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { mmLayout, dirColor, edgeColor, routeEdge } from './layout.js';

// MondrianPlate — renders the paper-exact Mondrian plate as an SVG.
export function MondrianPlate({
    terms, edges, selected, onSelect, showEdges, showLabels,
    plateW, plateH, zoom = 1,
}) {
    const layout = useMemo(
        () => mmLayout(terms, plateW, plateH),
        [terms, plateW, plateH]
    );
    const byId = useMemo(() => {
        const m = new Map();
        layout.blocks.forEach(b => m.set(b.term.id, b));
        return m;
    }, [layout]);

    const [hover, setHover] = useState(null);
    const [ox, oy, W, H] = layout.bbox;

    const numId = useCallback((t) => {
        const n = parseInt(String(t.id).replace(/\D/g, '').slice(-4) || '0', 10);
        return (n % 9000 + 1000).toString();
    }, []);

    const anySel = !!selected;
    const neighborSet = useMemo(() => {
        if (!selected) return null;
        const s = new Set([selected]);
        for (const e of edges) {
            if (e[0] === selected) s.add(e[1]);
            if (e[1] === selected) s.add(e[0]);
        }
        return s;
    }, [selected, edges]);

    return (
        <svg
            className="canvas-svg"
            viewBox={`0 0 ${plateW} ${plateH}`}
            preserveAspectRatio="xMidYMid meet"
            onClick={() => onSelect && onSelect(null)}
        >
            <rect x={0} y={0} width={plateW} height={plateH} fill="#ffffff" />
            <rect
                x={ox} y={oy} width={W} height={H}
                fill="none" stroke="#d6d3c9" strokeWidth={1}
                shapeRendering="crispEdges"
            />
            <defs>
                <clipPath id="plate-clip">
                    <rect x={ox} y={oy} width={W} height={H} />
                </clipPath>
            </defs>
            <g clipPath="url(#plate-clip)">
                {layout.segments.map((s, i) => (
                    <line
                        key={i}
                        x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                        stroke="#c6c6c6" strokeWidth={1}
                        shapeRendering="crispEdges"
                        opacity={anySel ? 0.55 : 1}
                    />
                ))}
            </g>

            {showEdges && edges.map((e, i) => {
                const a = byId.get(e[0]);
                const b = byId.get(e[1]);
                if (!a || !b) return null;
                const w = e[2] ?? 0.4;
                const thickness = 0.8 + w * 4.2;
                const col = edgeColor(a.term.dir, b.term.dir);
                const touchesSel = anySel && (e[0] === selected || e[1] === selected);
                const dim = anySel && !touchesSel;
                return (
                    <path
                        key={i}
                        d={routeEdge(a, b)}
                        fill="none"
                        stroke={col}
                        strokeWidth={thickness * (touchesSel ? 1.3 : 1)}
                        strokeLinecap="butt"
                        strokeLinejoin="miter"
                        opacity={dim ? 0.18 : 1}
                        pointerEvents="none"
                    />
                );
            })}

            {layout.blocks.map((b) => {
                const t = b.term;
                const sel = selected === t.id;
                const neighbor = neighborSet && neighborSet.has(t.id);
                const dim = anySel && !sel && !neighbor;
                const fill = dirColor(t.dir);
                const id = numId(t);
                const pillFs = Math.max(7, Math.min(10, Math.round(b.sw / 14)));
                const pillW = id.length * pillFs * 0.62 + 6;
                const pillH = pillFs + 4;
                const px = b.sx + 2;
                const py = b.sy - pillH - 1;
                return (
                    <g
                        key={t.id}
                        className={`mm-block ${sel ? 'sel' : ''}`}
                        onMouseEnter={() => setHover({ id: t.id, x: b.sx + b.sw / 2, y: b.sy })}
                        onMouseLeave={() => setHover(h => (h && h.id === t.id ? null : h))}
                        onClick={(e) => { e.stopPropagation(); onSelect && onSelect(t.id); }}
                        style={{ cursor: 'pointer' }}
                    >
                        <rect
                            className="main"
                            x={b.sx} y={b.sy} width={b.sw} height={b.sh}
                            fill={fill}
                            stroke="#111"
                            strokeWidth={sel ? 3 : 1.5}
                            opacity={dim ? 0.32 : 1}
                        />
                        {b.sw >= 14 && (
                            <g pointerEvents="none" opacity={dim ? 0.4 : 1}>
                                <rect x={px} y={py} width={pillW} height={pillH}
                                    fill="#ffffff" stroke="#111" strokeWidth={0.8} />
                                <text
                                    x={px + pillW / 2}
                                    y={py + pillH - 3}
                                    fontSize={pillFs}
                                    fontFamily="var(--mono)"
                                    fontWeight={600}
                                    fill="#111"
                                    textAnchor="middle"
                                >
                                    {id}
                                </text>
                            </g>
                        )}
                        <title>{t.name}</title>
                    </g>
                );
            })}

            {showLabels && (layout.labels || []).map((lab) => {
                const t = lab.term;
                const sel = selected === t.id;
                const neighbor = neighborSet && neighborSet.has(t.id);
                const visibleSize = lab.block.sw * zoom;
                const revealed = visibleSize >= 60;
                if (!sel && !neighbor && !revealed) return null;
                const dim = anySel && !sel && !neighbor;
                return (
                    <g key={`lbl-${t.id}`} className="mm-label-g" pointerEvents="none" opacity={dim ? 0.5 : 1}>
                        <rect
                            x={lab.x} y={lab.y} width={lab.w} height={lab.h}
                            fill="#ffffff"
                            fillOpacity={0.92}
                            stroke={sel ? '#111' : 'rgba(0,0,0,0)'}
                            strokeWidth={sel ? 1 : 0}
                        />
                        {lab.lines.map((line, i) => (
                            <text
                                key={i}
                                x={lab.x + lab.w / 2}
                                y={lab.y + (i + 1) * lab.fs * 1.2 + 2}
                                fontSize={lab.fs}
                                fontFamily="var(--display)"
                                fontWeight={600}
                                fill="#111"
                                textAnchor="middle"
                            >
                                {line}
                            </text>
                        ))}
                    </g>
                );
            })}

            {hover && (() => {
                const b = byId.get(hover.id);
                if (!b) return null;
                const t = b.term;
                const label = `${t.name}`;
                const subtitle = `${t.id} · −log₁₀p ${t.logp.toFixed(2)} · n=${t.n}`;
                const fs = 12;
                const w = Math.max(label.length, subtitle.length) * fs * 0.55 + 18;
                const h = fs * 2 + 14;
                let tx = b.sx + b.sw / 2 - w / 2;
                let ty = b.sy - h - 22;
                if (ty < 10) ty = b.sy + b.sh + 14;
                tx = Math.max(6, Math.min(plateW - w - 6, tx));
                return (
                    <g pointerEvents="none">
                        <rect x={tx} y={ty} width={w} height={h} fill="#111" rx={4} />
                        <text x={tx + 10} y={ty + fs + 4} fontSize={fs}
                            fontFamily="var(--display)" fontWeight={700} fill="#fff">
                            {label}
                        </text>
                        <text x={tx + 10} y={ty + fs * 2 + 6} fontSize={fs - 2}
                            fontFamily="var(--mono)" fill="#FFC928">
                            {subtitle}
                        </text>
                    </g>
                );
            })()}
        </svg>
    );
}

// MapSurface — pan & zoom controller that hosts the MondrianPlate.
export const MapSurface = React.forwardRef(function MapSurface(
    { children, plateW, plateH, onViewChange }, ref
) {
    const surfRef = useRef(null);
    const [view, setView] = useState({ x: 0, y: 0, k: 1 });
    const viewState = useRef(view);
    viewState.current = view;

    const fitToViewport = useCallback(() => {
        const el = surfRef.current; if (!el) return;
        const rect = el.getBoundingClientRect();
        const sx = rect.width / plateW;
        const sy = rect.height / plateH;
        const k = Math.min(sx, sy) * 0.82;
        const cx = (rect.width - plateW * k) / 2;
        const cy = (rect.height - plateH * k) / 2;
        setView({ x: cx, y: cy, k });
    }, [plateW, plateH]);

    useImperativeHandle(ref, () => ({
        zoomIn: () => setView(v => clampView(applyZoomAtCenter(v, 1.3, surfRef.current))),
        zoomOut: () => setView(v => clampView(applyZoomAtCenter(v, 1 / 1.3, surfRef.current))),
        reset: () => fitToViewport(),
        getView: () => viewState.current,
    }), [fitToViewport]);

    useEffect(() => { fitToViewport(); }, [fitToViewport]);
    useEffect(() => {
        const onResize = () => fitToViewport();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [fitToViewport]);

    useEffect(() => { if (onViewChange) onViewChange(view); }, [view, onViewChange]);

    function clampView(v) { return { ...v, k: Math.max(0.25, Math.min(8, v.k)) }; }

    function applyZoomAtCenter(v, factor, el) {
        if (!el) return { ...v, k: v.k * factor };
        const rect = el.getBoundingClientRect();
        const cx = rect.width / 2, cy = rect.height / 2;
        const nk = v.k * factor;
        const wx = (cx - v.x) / v.k;
        const wy = (cy - v.y) / v.k;
        return { x: cx - wx * nk, y: cy - wy * nk, k: nk };
    }

    const onWheel = (e) => {
        e.preventDefault();
        const el = surfRef.current;
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        setView(v => {
            const nk = Math.max(0.25, Math.min(8, v.k * factor));
            const wx = (px - v.x) / v.k;
            const wy = (py - v.y) / v.k;
            return { x: px - wx * nk, y: py - wy * nk, k: nk };
        });
    };

    // Wheel listener needs to be attached as non-passive so preventDefault works.
    useEffect(() => {
        const el = surfRef.current; if (!el) return;
        const handler = (e) => onWheel(e);
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }); // no deps — re-attach each render so the closure sees fresh view

    const dragging = useRef(null);
    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        dragging.current = { sx: e.clientX, sy: e.clientY, start: view };
        document.body.style.cursor = 'grabbing';
    };
    useEffect(() => {
        const onMove = (e) => {
            if (!dragging.current) return;
            const dx = e.clientX - dragging.current.sx;
            const dy = e.clientY - dragging.current.sy;
            const s = dragging.current.start;
            setView({ x: s.x + dx, y: s.y + dy, k: s.k });
        };
        const onUp = () => {
            dragging.current = null;
            document.body.style.cursor = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    return (
        <div ref={surfRef} className="map-surface" onMouseDown={onMouseDown}>
            <div
                className="mondrian-plate"
                style={{
                    width: plateW, height: plateH,
                    left: 0, top: 0,
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
});
