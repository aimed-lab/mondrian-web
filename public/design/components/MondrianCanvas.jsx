/* global React */

// ============================================================================
// Mondrian guillotine layout — matches the PAPER:
// - Partition the plate into cells via recursive splits on the longer axis.
// - Inside each cell place a SQUARE whose side is proportional to -log10(p).
// - Square is anchored at the term's UMAP (x, y) position, clamped inside cell.
// - Partition lines are FAINT GRAY; only outer border is black.
// - Labels sit OUTSIDE blocks in white rectangles, connected by short rules.
// ============================================================================

window.mmLayout = function mmLayout(terms, width, height, opts = {}) {
  const pad = opts.pad ?? 30;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const ox = pad, oy = pad;
  if (!terms.length) return { blocks: [], segments: [], bbox: [ox, oy, W, H] };

  const segments = [];

  function split(node) {
    const { rect, terms } = node;
    if (terms.length === 1) return [{ rect, term: terms[0] }];
    const [x0, y0, x1, y1] = rect;
    const rw = x1 - x0, rh = y1 - y0;
    const horiz = rw >= rh;
    const sorted = terms.slice().sort((a, b) => horiz ? a.x - b.x : a.y - b.y);
    const mid = Math.floor(sorted.length / 2);
    const lo = sorted[mid - 1][horiz ? "x" : "y"];
    const hi = sorted[mid][horiz ? "x" : "y"];
    let cut = (lo + hi) / 2;
    const minSide = 0.05;
    if (horiz) cut = Math.max(x0 + minSide, Math.min(x1 - minSide, cut));
    else       cut = Math.max(y0 + minSide, Math.min(y1 - minSide, cut));

    if (horiz) {
      segments.push({ x0: cut, y0, x1: cut, y1 });
      return [
        ...split({ rect: [x0, y0, cut, y1], terms: sorted.slice(0, mid) }),
        ...split({ rect: [cut, y0, x1, y1], terms: sorted.slice(mid) }),
      ];
    } else {
      segments.push({ x0, y0: cut, x1, y1: cut });
      return [
        ...split({ rect: [x0, y0, x1, cut], terms: sorted.slice(0, mid) }),
        ...split({ rect: [x0, cut, x1, y1], terms: sorted.slice(mid) }),
      ];
    }
  }

  const leaves = split({ rect: [0, 0, 1, 1], terms: terms.slice() });

  // Square-size: proportional to -log10(p), with a floor and ceiling.
  // Clamped to fit inside its cell with a margin.
  const logps = terms.map(t => t.logp);
  const maxLogP = Math.max(...logps);
  const minLogP = Math.min(...logps);

  const blocks = leaves.map(({ rect, term }) => {
    const [x0, y0, x1, y1] = rect;
    const cw = x1 - x0, ch = y1 - y0;

    // cell margin (10-15% of short side)
    const m = 0.12 * Math.min(cw, ch);
    const maxSide = Math.min(cw, ch) - m * 2;

    // square side scales with logp, normalized so smallest gets ~40% of max
    const t = (term.logp - minLogP) / Math.max(0.001, (maxLogP - minLogP));
    const f = 0.42 + 0.58 * t;
    const side = Math.min(maxSide, Math.max(maxSide * 0.18, maxSide * f));

    // Anchor the square at the term's UMAP (x, y) in PLATE coords, then
    // clamp so it stays inside the cell with margin.
    const ax = term.x - side / 2;
    const ay = term.y - side / 2;
    const bx = Math.max(x0 + m, Math.min(x1 - m - side, ax));
    const by = Math.max(y0 + m, Math.min(y1 - m - side, ay));

    return { term, cell: rect, x: bx, y: by, w: side, h: side };
  });

  const toX = nx => ox + nx * W;
  const toY = ny => oy + ny * H;
  const sBlocks = blocks.map(b => ({
    ...b,
    sx: toX(b.x), sy: toY(b.y), sw: b.w * W, sh: b.h * H,
    scell: [toX(b.cell[0]), toY(b.cell[1]), toX(b.cell[2]), toY(b.cell[3])],
  }));
  const sSeg = segments.map(s => ({
    x1: toX(s.x0), y1: toY(s.y0),
    x2: toX(s.x1), y2: toY(s.y1),
  }));

  // --- Label placement ---
  // For each block, pick a side with most empty room inside the cell and
  // place a white-box label there. Labels are always outside the block, inside
  // the cell. If cell is tiny, place a compact label below.
  const labels = placeLabels(sBlocks, width, height);

  return { blocks: sBlocks, segments: sSeg, bbox: [ox, oy, W, H], labels };
};

// Place labels outside-block, with PLATE-level collision avoidance.
// Labels can extend into neighboring cells' whitespace (matches the paper).
function placeLabels(blocks, plateW, plateH) {
  const labels = [];
  for (const b of blocks) {
    // Label size: scales with block size (big blocks → big labels).
    // Minimum 11px so nothing gets unreadable.
    const scale = Math.max(0.8, Math.min(1.8, b.sw / 110));
    const fs = Math.round(13 * scale);
    const lineChars = Math.round(15 * Math.max(1.0, scale * 0.95));
    const lines = wrapText(b.term.name, lineChars);
    const boxW = Math.max(lines.reduce((m, l) => Math.max(m, l.length), 0) * fs * 0.56 + 12, b.sw + 8);
    const boxH = lines.length * fs * 1.2 + 4;

    // Prefer TOP placement (matches paper) — fall back to other sides if no room
    const cx = b.sx + b.sw / 2;
    const cy = b.sy + b.sh / 2;
    const choices = [
      { side: "top",    x: cx - boxW / 2, y: b.sy - boxH - 8 },
      { side: "bottom", x: cx - boxW / 2, y: b.sy + b.sh + 8 },
      { side: "right",  x: b.sx + b.sw + 10, y: cy - boxH / 2 },
      { side: "left",   x: b.sx - boxW - 10, y: cy - boxH / 2 },
    ];
    labels.push({
      term: b.term, block: b,
      choices, fs, lines, boxW, boxH,
      importance: b.term.logp * (b.sw * b.sh),
    });
  }
  // Greedy placement: biggest / most important first
  labels.sort((a, z) => z.importance - a.importance);
  const placedRects = [];
  // Block rects count as obstacles too
  for (const b of blocks) placedRects.push([b.sx - 2, b.sy - 2, b.sx + b.sw + 2, b.sy + b.sh + 2]);

  const finals = [];
  for (const lab of labels) {
    let chosen = null;
    for (const c of lab.choices) {
      // Clamp to plate (not to cell)
      const x = Math.max(4, Math.min(plateW - lab.boxW - 4, c.x));
      const y = Math.max(4, Math.min(plateH - lab.boxH - 4, c.y));
      const rect = [x, y, x + lab.boxW, y + lab.boxH];
      let ok = true;
      for (const p of placedRects) {
        if (!(rect[2] < p[0] || rect[0] > p[2] || rect[3] < p[1] || rect[1] > p[3])) { ok = false; break; }
      }
      if (ok) { chosen = { ...c, x, y, rect }; break; }
    }
    if (chosen) {
      placedRects.push(chosen.rect);
      finals.push({
        term: lab.term, block: lab.block,
        x: chosen.x, y: chosen.y, w: lab.boxW, h: lab.boxH,
        lines: lab.lines, fs: lab.fs, side: chosen.side,
      });
    }
  }
  return finals;
}

function wrapText(s, maxChars) {
  const words = s.split(/\s+/);
  const lines = []; let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function dirColor(dir) {
  if (dir > 0) return "#E63946";   // vivid red
  if (dir < 0) return "#1D4ED8";   // deep blue
  return "#FFC928";                // gold / yellow
}

// Edge color rule from the paper:
//   up ↔ up          → RED
//   down ↔ down      → BLUE
//   anything else    → YELLOW  (shared / mixed / neutral)
function edgeColor(dirA, dirB) {
  if (dirA > 0 && dirB > 0) return "#E63946";
  if (dirA < 0 && dirB < 0) return "#1D4ED8";
  return "#E8A82B"; // warm yellow that reads on white
}

// Pick a "port" on a block's edge that faces the target block center.
// Returns {x, y, side}.
function portTowards(a, tx, ty) {
  const cx = a.sx + a.sw / 2, cy = a.sy + a.sh / 2;
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // exit left/right
    if (dx >= 0) return { x: a.sx + a.sw, y: cy, side: "r" };
    return { x: a.sx, y: cy, side: "l" };
  } else {
    if (dy >= 0) return { x: cx, y: a.sy + a.sh, side: "b" };
    return { x: cx, y: a.sy, side: "t" };
  }
}

// Build an L-shaped (or Z-shaped) orthogonal route between two blocks that
// stays in the whitespace around them. Returns an SVG path `d` string.
function routeEdge(a, b) {
  const acx = a.sx + a.sw / 2, acy = a.sy + a.sh / 2;
  const bcx = b.sx + b.sw / 2, bcy = b.sy + b.sh / 2;
  const p1 = portTowards(a, bcx, bcy);
  const p2 = portTowards(b, acx, acy);
  // Route: from p1, push out perpendicular by 8px, then turn toward p2,
  // then align to p2's axis, then into p2.
  const out1 = { x: p1.x, y: p1.y };
  if (p1.side === "l") out1.x -= 10;
  if (p1.side === "r") out1.x += 10;
  if (p1.side === "t") out1.y -= 10;
  if (p1.side === "b") out1.y += 10;
  const out2 = { x: p2.x, y: p2.y };
  if (p2.side === "l") out2.x -= 10;
  if (p2.side === "r") out2.x += 10;
  if (p2.side === "t") out2.y -= 10;
  if (p2.side === "b") out2.y += 10;
  // Build L: from out1 → corner → out2
  // corner chosen so segments are orthogonal to their end
  const p1horiz = p1.side === "l" || p1.side === "r";
  const corner = p1horiz ? { x: out2.x, y: out1.y } : { x: out1.x, y: out2.y };
  return `M ${p1.x} ${p1.y} L ${out1.x} ${out1.y} L ${corner.x} ${corner.y} L ${out2.x} ${out2.y} L ${p2.x} ${p2.y}`;
}

// ============================================================================
// MondrianPlate — renders the paper-exact Mondrian plate.
// ============================================================================

function MondrianPlate({ terms, edges, selected, onSelect, showEdges, showLabels, plateW, plateH, caseLabel, layerLabel, zoom = 1 }) {
  const layout = React.useMemo(
    () => window.mmLayout(terms, plateW, plateH),
    [terms, plateW, plateH]
  );
  const byId = React.useMemo(() => {
    const m = new Map();
    layout.blocks.forEach(b => m.set(b.term.id, b));
    return m;
  }, [layout]);

  const [hover, setHover] = React.useState(null);
  const [ox, oy, W, H] = layout.bbox;

  // Map each term to a compact numeric ID that shows on the pill tab.
  // Paper style: 4-digit numbers like "2483". We fake it by hashing the GO id.
  const numId = React.useCallback((t) => {
    // stable 4-digit id from the GO id tail
    const n = parseInt(String(t.id).replace(/\D/g, "").slice(-4) || "0", 10);
    return (n % 9000 + 1000).toString();
  }, []);

  // Precompute which blocks are "active" for selection-dim behavior.
  // When something is selected, fade others slightly.
  const anySel = !!selected;
  const neighborSet = React.useMemo(() => {
    if (!selected) return null;
    const s = new Set([selected]);
    for (const e of edges) {
      if (e[0] === selected) s.add(e[1]);
      if (e[1] === selected) s.add(e[0]);
    }
    return s;
  }, [selected, edges]);

  return (
    <svg className="canvas-svg" viewBox={`0 0 ${plateW} ${plateH}`}
         preserveAspectRatio="xMidYMid meet"
         onClick={() => onSelect(null)}>
      {/* paper — seamless white */}
      <rect x={0} y={0} width={plateW} height={plateH} fill="#ffffff"/>

      {/* subtle plate outline — thin gray, defines the Mondrian composition
          without the heavy "photo frame" look of the paper */}
      <rect x={ox} y={oy} width={W} height={H}
            fill="none" stroke="#d6d3c9" strokeWidth={1}
            shapeRendering="crispEdges"/>

      {/* partition lines — FAINT GRAY, thin, clipped to the plate bbox so they
          don't bleed into the whitespace around the (now frameless) plate. */}
      <defs>
        <clipPath id="plate-clip">
          <rect x={ox} y={oy} width={W} height={H}/>
        </clipPath>
      </defs>
      <g clipPath="url(#plate-clip)">
        {layout.segments.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                stroke="#c6c6c6" strokeWidth={1} shapeRendering="crispEdges"
                opacity={anySel ? 0.55 : 1}/>
        ))}
      </g>

      {/* crosstalk edges — L-shaped orthogonal routes, colored by direction pair,
          thickness by weight. Dimmed when not adjacent to selection. */}
      {showEdges && edges.map((e, i) => {
        const a = byId.get(e[0]); const b = byId.get(e[1]);
        if (!a || !b) return null;
        const w = e[2] ?? 0.4;
        const thickness = 0.8 + w * 4.2; // 0.8 → 5.0
        const col = edgeColor(a.term.dir, b.term.dir);
        const touchesSel = anySel && (e[0] === selected || e[1] === selected);
        const dim = anySel && !touchesSel;
        const d = routeEdge(a, b);
        return (
          <path key={i}
                d={d}
                fill="none"
                stroke={col}
                strokeWidth={thickness * (touchesSel ? 1.3 : 1)}
                strokeLinecap="butt"
                strokeLinejoin="miter"
                opacity={dim ? 0.18 : 1}
                pointerEvents="none"/>
        );
      })}

      {/* blocks — SQUARES, fill with direction color, thin black stroke.
          Unselected blocks fade slightly when something IS selected. */}
      {layout.blocks.map((b) => {
        const t = b.term;
        const sel = selected === t.id;
        const neighbor = neighborSet && neighborSet.has(t.id);
        const dim = anySel && !sel && !neighbor;
        const fill = dirColor(t.dir);
        return (
          <g key={t.id}
             className={`mm-block ${sel ? "sel" : ""}`}
             onMouseEnter={() => setHover({ id: t.id, x: b.sx + b.sw/2, y: b.sy })}
             onMouseLeave={() => setHover(h => (h && h.id === t.id ? null : h))}
             onClick={(e) => { e.stopPropagation(); onSelect(t.id); }}
             style={{ cursor: "pointer" }}>
            <rect className="main"
                  x={b.sx} y={b.sy} width={b.sw} height={b.sh}
                  fill={fill}
                  stroke="#111"
                  strokeWidth={sel ? 3 : 1.5}
                  opacity={dim ? 0.32 : 1}/>
            {/* ID pill tab — small rectangle above-top-left of block */}
            {b.sw >= 14 && (() => {
              const id = numId(t);
              const pillFs = Math.max(7, Math.min(10, Math.round(b.sw / 14)));
              const pillW = id.length * pillFs * 0.62 + 6;
              const pillH = pillFs + 4;
              const px = b.sx + 2;
              const py = b.sy - pillH - 1;
              return (
                <g pointerEvents="none" opacity={dim ? 0.4 : 1}>
                  <rect x={px} y={py} width={pillW} height={pillH}
                        fill="#ffffff" stroke="#111" strokeWidth={0.8}/>
                  <text x={px + pillW/2} y={py + pillH - 3}
                        fontSize={pillFs}
                        fontFamily="var(--mono)"
                        fontWeight={600}
                        fill="#111"
                        textAnchor="middle">{id}</text>
                </g>
              );
            })()}
            <title>{t.name}</title>
          </g>
        );
      })}

      {/* labels — progressive reveal based on zoom:
          - At fit zoom, only the top ~3 largest blocks get full names
          - As user zooms in, progressively more names appear
          - Selected + crosstalk neighbors always labeled */}
      {showLabels && (layout.labels || []).map((lab) => {
        const t = lab.term;
        const sel = selected === t.id;
        const neighbor = neighborSet && neighborSet.has(t.id);
        // Effective block size at current zoom (in viewport px)
        const visibleSize = lab.block.sw * zoom;
        // Reveal threshold: show names for any block at ≥60px on screen
        // (this lets the biggest ~4-6 blocks stay labeled at fit zoom,
        //  and progressively reveals smaller blocks as user zooms in)
        const revealed = visibleSize >= 60;
        if (!sel && !neighbor && !revealed) return null;
        const dim = anySel && !sel && !neighbor;
        return (
          <g key={`lbl-${t.id}`} className="mm-label-g" pointerEvents="none"
             opacity={dim ? 0.5 : 1}>
            <rect x={lab.x} y={lab.y} width={lab.w} height={lab.h}
                  fill="#ffffff"
                  fillOpacity={0.92}
                  stroke={sel ? "#111" : "rgba(0,0,0,0)"}
                  strokeWidth={sel ? 1 : 0}/>
            {lab.lines.map((line, i) => (
              <text key={i}
                    x={lab.x + lab.w / 2}
                    y={lab.y + (i + 1) * lab.fs * 1.2 + 2}
                    fontSize={lab.fs}
                    fontFamily="var(--display)"
                    fontWeight={600}
                    fill="#111"
                    textAnchor="middle">
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {/* Hover tooltip — floating HTML-in-SVG via foreignObject-free approach.
          We render a short pill above the hovered block with name + GO id. */}
      {hover && (() => {
        const b = byId.get(hover.id);
        if (!b) return null;
        const t = b.term;
        const label = `${t.name}`;
        const subtitle = `${t.id} · −log₁₀p ${t.logp.toFixed(2)} · n=${t.n}`;
        const fs = 12;
        const w = Math.max(label.length, subtitle.length) * fs * 0.55 + 18;
        const h = fs * 2 + 14;
        let tx = b.sx + b.sw/2 - w/2;
        let ty = b.sy - h - 22; // above id-pill
        if (ty < 10) ty = b.sy + b.sh + 14;
        tx = Math.max(6, Math.min(plateW - w - 6, tx));
        return (
          <g pointerEvents="none">
            <rect x={tx} y={ty} width={w} height={h}
                  fill="#111"
                  rx={4}/>
            <text x={tx + 10} y={ty + fs + 4}
                  fontSize={fs}
                  fontFamily="var(--display)"
                  fontWeight={700}
                  fill="#fff">{label}</text>
            <text x={tx + 10} y={ty + fs * 2 + 6}
                  fontSize={fs - 2}
                  fontFamily="var(--mono)"
                  fill="#FFC928">{subtitle}</text>
          </g>
        );
      })()}

      {/* (cartouche removed — the floating search pill now shows case + layer) */}
    </svg>
  );
}

// ============================================================================
// MapSurface — pan & zoom controller that hosts the MondrianPlate.
// ============================================================================

function MapSurface({ children, plateW, plateH, viewRef, onViewChange }) {
  const surfRef = React.useRef(null);
  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });
  const viewState = React.useRef(view);
  viewState.current = view;

  React.useImperativeHandle(viewRef, () => ({
    zoomIn: () => setView(v => clampView(applyZoomAtCenter(v, 1.3, surfRef.current))),
    zoomOut: () => setView(v => clampView(applyZoomAtCenter(v, 1/1.3, surfRef.current))),
    reset: () => fitToViewport(),
    getView: () => viewState.current,
  }), []);

  const fitToViewport = React.useCallback(() => {
    const el = surfRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = rect.width / plateW;
    const sy = rect.height / plateH;
    const k = Math.min(sx, sy) * 0.82;
    const cx = (rect.width  - plateW * k) / 2;
    const cy = (rect.height - plateH * k) / 2;
    setView({ x: cx, y: cy, k });
  }, [plateW, plateH]);

  React.useEffect(() => { fitToViewport(); }, [fitToViewport]);
  React.useEffect(() => {
    const onResize = () => fitToViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitToViewport]);

  React.useEffect(() => {
    if (onViewChange) onViewChange(view);
  }, [view, onViewChange]);

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

  function onWheel(e) {
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
  }

  const dragging = React.useRef(null);
  function onMouseDown(e) {
    if (e.button !== 0) return;
    dragging.current = { sx: e.clientX, sy: e.clientY, start: view };
    document.body.style.cursor = "grabbing";
  }
  function onMouseMove(e) {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.sx;
    const dy = e.clientY - dragging.current.sy;
    const s = dragging.current.start;
    setView({ x: s.x + dx, y: s.y + dy, k: s.k });
  }
  function onMouseUp() {
    dragging.current = null;
    document.body.style.cursor = "";
  }

  React.useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  });

  return (
    <div ref={surfRef} className="map-surface"
         onWheel={onWheel}
         onMouseDown={onMouseDown}>
      <div className="mondrian-plate"
           style={{
             width: plateW, height: plateH,
             left: 0, top: 0,
             transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
           }}>
        {children}
      </div>
    </div>
  );
}

window.MondrianPlate = MondrianPlate;
window.MapSurface = MapSurface;
