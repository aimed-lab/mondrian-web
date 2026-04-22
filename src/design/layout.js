// Pure layout helpers for the Mondrian plate — no React.
// Ported from the design prototype's MondrianCanvas.jsx (window.mmLayout).
//
// A term has shape: { id, name, layer, logp, n, dir, genes, x, y }
// where (x, y) are normalized to [0, 1] in plate coordinates.

export function mmLayout(terms, width, height, opts = {}) {
    const pad = opts.pad ?? 30;
    const W = width - pad * 2;
    const H = height - pad * 2;
    const ox = pad, oy = pad;
    if (!terms.length) return { blocks: [], segments: [], bbox: [ox, oy, W, H], labels: [] };

    const segments = [];

    function split(node) {
        const { rect, terms } = node;
        if (terms.length === 1) return [{ rect, term: terms[0] }];
        const [x0, y0, x1, y1] = rect;
        const rw = x1 - x0, rh = y1 - y0;
        const horiz = rw >= rh;
        const sorted = terms.slice().sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
        const mid = Math.floor(sorted.length / 2);
        const lo = sorted[mid - 1][horiz ? 'x' : 'y'];
        const hi = sorted[mid][horiz ? 'x' : 'y'];
        let cut = (lo + hi) / 2;
        const minSide = 0.05;
        if (horiz) cut = Math.max(x0 + minSide, Math.min(x1 - minSide, cut));
        else cut = Math.max(y0 + minSide, Math.min(y1 - minSide, cut));

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

    const logps = terms.map(t => t.logp);
    const maxLogP = Math.max(...logps);
    const minLogP = Math.min(...logps);

    const blocks = leaves.map(({ rect, term }) => {
        const [x0, y0, x1, y1] = rect;
        const cw = x1 - x0, ch = y1 - y0;
        const m = 0.12 * Math.min(cw, ch);
        const maxSide = Math.min(cw, ch) - m * 2;

        const t = (term.logp - minLogP) / Math.max(0.001, maxLogP - minLogP);
        const f = 0.42 + 0.58 * t;
        const side = Math.min(maxSide, Math.max(maxSide * 0.18, maxSide * f));

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

    const labels = placeLabels(sBlocks, width, height);

    return { blocks: sBlocks, segments: sSeg, bbox: [ox, oy, W, H], labels };
}

function placeLabels(blocks, plateW, plateH) {
    const labels = [];
    for (const b of blocks) {
        const scale = Math.max(0.8, Math.min(1.8, b.sw / 110));
        const fs = Math.round(13 * scale);
        const lineChars = Math.round(15 * Math.max(1.0, scale * 0.95));
        const lines = wrapText(b.term.name, lineChars);
        const boxW = Math.max(lines.reduce((m, l) => Math.max(m, l.length), 0) * fs * 0.56 + 12, b.sw + 8);
        const boxH = lines.length * fs * 1.2 + 4;

        const cx = b.sx + b.sw / 2;
        const cy = b.sy + b.sh / 2;
        const choices = [
            { side: 'top',    x: cx - boxW / 2, y: b.sy - boxH - 8 },
            { side: 'bottom', x: cx - boxW / 2, y: b.sy + b.sh + 8 },
            { side: 'right',  x: b.sx + b.sw + 10, y: cy - boxH / 2 },
            { side: 'left',   x: b.sx - boxW - 10, y: cy - boxH / 2 },
        ];
        labels.push({
            term: b.term, block: b, choices, fs, lines, boxW, boxH,
            importance: b.term.logp * (b.sw * b.sh),
        });
    }
    labels.sort((a, z) => z.importance - a.importance);
    const placedRects = [];
    for (const b of blocks) placedRects.push([b.sx - 2, b.sy - 2, b.sx + b.sw + 2, b.sy + b.sh + 2]);

    const finals = [];
    for (const lab of labels) {
        let chosen = null;
        for (const c of lab.choices) {
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
    const words = (s || '').split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if (!cur) { cur = w; continue; }
        if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
}

export function dirColor(dir) {
    if (dir > 0) return '#E63946';
    if (dir < 0) return '#1D4ED8';
    return '#FFC928';
}

export function edgeColor(dirA, dirB) {
    if (dirA > 0 && dirB > 0) return '#E63946';
    if (dirA < 0 && dirB < 0) return '#1D4ED8';
    return '#E8A82B';
}

function portTowards(a, tx, ty) {
    const cx = a.sx + a.sw / 2, cy = a.sy + a.sh / 2;
    const dx = tx - cx, dy = ty - cy;
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx >= 0) return { x: a.sx + a.sw, y: cy, side: 'r' };
        return { x: a.sx, y: cy, side: 'l' };
    } else {
        if (dy >= 0) return { x: cx, y: a.sy + a.sh, side: 'b' };
        return { x: cx, y: a.sy, side: 't' };
    }
}

export function routeEdge(a, b) {
    const acx = a.sx + a.sw / 2, acy = a.sy + a.sh / 2;
    const bcx = b.sx + b.sw / 2, bcy = b.sy + b.sh / 2;
    const p1 = portTowards(a, bcx, bcy);
    const p2 = portTowards(b, acx, acy);
    const out1 = { x: p1.x, y: p1.y };
    if (p1.side === 'l') out1.x -= 10;
    if (p1.side === 'r') out1.x += 10;
    if (p1.side === 't') out1.y -= 10;
    if (p1.side === 'b') out1.y += 10;
    const out2 = { x: p2.x, y: p2.y };
    if (p2.side === 'l') out2.x -= 10;
    if (p2.side === 'r') out2.x += 10;
    if (p2.side === 't') out2.y -= 10;
    if (p2.side === 'b') out2.y += 10;
    const p1horiz = p1.side === 'l' || p1.side === 'r';
    const corner = p1horiz ? { x: out2.x, y: out1.y } : { x: out1.x, y: out2.y };
    return `M ${p1.x} ${p1.y} L ${out1.x} ${out1.y} L ${corner.x} ${corner.y} L ${out2.x} ${out2.y} L ${p2.x} ${p2.y}`;
}
