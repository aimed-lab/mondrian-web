import React, { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { downloadEnrichmentJSON } from '../utils/downloadEnrichmentResults.js';

const MondrianMap = forwardRef(function MondrianMap({ entities, relationships, width = 1000, height = 1000, parameters = {}, metadata = {}, dataSource = 'real', isLoading = false, onSelectionChange = null, onLayerZoom = null, showAnnotations = true }, ref) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [selection, setSelection] = useState({ entities: new Set(), relationships: new Set() });
    const [contextMenu, setContextMenu] = useState(null);

    const isRealData = dataSource === 'real';
    const blockSpacing = parameters.blockSpacing || 5;
    const blockSizeMultiplier = parameters.blockSizeMultiplier || 1.0;

    /**
     * Get block dimensions for an entity.
     * Real data: uses pre-computed w/h from pipeline JSON.
     * Synthetic data: uses foldChange-based sizing (original behavior).
     */
    const getBlockDims = useCallback((entity) => {
        const gridSize = 10;
        if (isRealData && entity.w && entity.h) {
            // Real data with pre-computed dimensions (already multiplied in App.jsx)
            const w = Math.max(gridSize, Math.round(entity.w / gridSize) * gridSize);
            const h = Math.max(gridSize, Math.round(entity.h / gridSize) * gridSize);
            return { w, h };
        }
        // Synthetic data: fold-change-based sizing
        const size = Math.abs(entity.foldChange) * 30 * blockSizeMultiplier;
        const snappedSize = Math.max(gridSize, Math.round(size / gridSize) * gridSize);
        return { w: snappedSize, h: snappedSize };
    }, [isRealData, blockSizeMultiplier]);

    /**
     * Get color for an entity.
     * Real data: uses pre-computed color from pipeline.
     * Synthetic data: uses foldChange/pValue logic.
     */
    const getColor = useCallback((entity) => {
        if (isRealData && entity.color) return entity.color;
        // Synthetic color logic
        const p = entity.pValue;
        const fc = entity.foldChange;
        if (p < 0.05) {
            if (fc >= 1.25) return '#E30022';
            if (fc <= 0.75) return '#0078BF';
            return '#FFD700';
        }
        return '#1D1D1D';
    }, [isRealData]);

    // Resolve overlaps via D3 force simulation
    const resolveLayout = useCallback((rawEntities) => {
        if (!rawEntities || rawEntities.length === 0) return [];
        const nodes = rawEntities.map(e => {
            const dims = getBlockDims(e);
            return {
                ...e,
                x: e.x,
                y: e.y,
                r: (Math.max(dims.w, dims.h) / 2) + blockSpacing,
            };
        });

        const simulation = d3.forceSimulation(nodes)
            .force("x", d3.forceX(d => d.x).strength(0.5))
            .force("y", d3.forceY(d => d.y).strength(0.5))
            .force("collide", d3.forceCollide(d => {
                const dims = getBlockDims(d);
                return (Math.max(dims.w, dims.h) * 0.75) + blockSpacing;
            }).strength(1).iterations(2))
            .stop();

        for (let i = 0; i < 300; ++i) simulation.tick();

        return nodes.map((n, i) => ({
            ...rawEntities[i],
            x: n.x,
            y: n.y
        }));
    }, [getBlockDims, blockSpacing]);

    const layoutEntities = useMemo(() => resolveLayout(entities), [entities, resolveLayout]);

    // --- Mondrian Grid Line Generation ---
    const generateMondrianLines = useCallback((nodes, edges, containerWidth, containerHeight) => {
        if (!nodes || !edges) return [];
        const lines = [];
        const gridSize = 10;
        const snap = (val) => Math.round(val / gridSize) * gridSize;

        const hWalls = [];
        const vWalls = [];

        // Canvas borders
        hWalls.push({ y: 0, x1: 0, x2: containerWidth, type: 'border' });
        hWalls.push({ y: containerHeight, x1: 0, x2: containerWidth, type: 'border' });
        vWalls.push({ x: 0, y1: 0, y2: containerHeight, type: 'border' });
        vWalls.push({ x: containerWidth, y1: 0, y2: containerHeight, type: 'border' });

        // Entity borders
        const rects = nodes.map(entity => {
            const dims = getBlockDims(entity);
            const w = dims.w;
            const h = dims.h;
            const x = Math.max(0, Math.min(containerWidth - w, snap(entity.x - w / 2)));
            const y = Math.max(0, Math.min(containerHeight - h, snap(entity.y - h / 2)));

            hWalls.push({ y: y, x1: x, x2: x + w, type: 'entity' });
            hWalls.push({ y: y + h, x1: x, x2: x + w, type: 'entity' });
            vWalls.push({ x: x, y1: y, y2: y + h, type: 'entity' });
            vWalls.push({ x: x + w, y1: y, y2: y + h, type: 'entity' });

            return { x, y, w, h, id: entity.id };
        });

        // Relationship lines
        const knees = [];
        edges.forEach(rel => {
            const sRect = rects.find(r => r.id === rel.source);
            const tRect = rects.find(r => r.id === rel.target);
            if (!sRect || !tRect) return;

            const getCorners = (r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }];
            const sCorners = getCorners(sRect);
            const tCorners = getCorners(tRect);
            let best = { s: sCorners[0], t: tCorners[0], dist: Infinity };

            sCorners.forEach(s => tCorners.forEach(t => {
                const dist = Math.hypot(s.x - t.x, s.y - t.y);
                if (dist < best.dist) best = { s, t, dist };
            }));

            if (best.s.y === best.t.y) {
                hWalls.push({ y: best.s.y, x1: Math.min(best.s.x, best.t.x), x2: Math.max(best.s.x, best.t.x), type: 'edge' });
            } else if (best.s.x === best.t.x) {
                vWalls.push({ x: best.s.x, y1: Math.min(best.s.y, best.t.y), y2: Math.max(best.s.y, best.t.y), type: 'edge' });
            } else {
                hWalls.push({ y: best.s.y, x1: Math.min(best.s.x, best.t.x), x2: Math.max(best.s.x, best.t.x), type: 'edge' });
                vWalls.push({ x: best.t.x, y1: Math.min(best.s.y, best.t.y), y2: Math.max(best.s.y, best.t.y), type: 'edge' });

                const hDir = best.s.x < best.t.x ? 'left' : 'right';
                const vDir = best.s.y < best.t.y ? 'down' : 'up';
                const allDirs = ['up', 'down', 'left', 'right'];
                const freeDirs = allDirs.filter(d => d !== hDir && d !== vDir);
                knees.push({ x: best.t.x, y: best.s.y, freeDirs, relId: `${rel.source}-${rel.target}` });
            }
        });

        // Source points from entity corners
        let sourcePoints = [];
        rects.forEach(r => {
            sourcePoints.push({ x: r.x, y: r.y, dirs: ['up', 'left'], id: r.id });
            sourcePoints.push({ x: r.x + r.w, y: r.y, dirs: ['up', 'right'], id: r.id });
            sourcePoints.push({ x: r.x, y: r.y + r.h, dirs: ['down', 'left'], id: r.id });
            sourcePoints.push({ x: r.x + r.w, y: r.y + r.h, dirs: ['down', 'right'], id: r.id });
        });

        sourcePoints = sourcePoints.filter(p => p.x >= 0 && p.x <= containerWidth && p.y >= 0 && p.y <= containerHeight);
        sourcePoints.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        const castRay = (px, py, dir) => {
            let dist = Infinity;
            let hitVal = null;
            const isH = (dir === 'left' || dir === 'right');

            if (isH) {
                const lookRight = (dir === 'right');
                vWalls.forEach(wall => {
                    if (wall.y1 <= py && wall.y2 >= py) {
                        const d = lookRight ? (wall.x - px) : (px - wall.x);
                        if (d > 1 && d < dist) { dist = d; hitVal = wall.x; }
                    }
                });
            } else {
                const lookDown = (dir === 'down');
                hWalls.forEach(wall => {
                    if (wall.x1 <= px && wall.x2 >= px) {
                        const d = lookDown ? (wall.y - py) : (py - wall.y);
                        if (d > 1 && d < dist) { dist = d; hitVal = wall.y; }
                    }
                });
            }

            if (hitVal !== null) {
                return {
                    x1: px, y1: py,
                    x2: isH ? hitVal : px,
                    y2: isH ? py : hitVal,
                    isH, dist
                };
            }
            return null;
        };

        const commitRay = (ray) => {
            lines.push(ray);
            if (ray.isH) {
                hWalls.push({ y: ray.y1, x1: Math.min(ray.x1, ray.x2), x2: Math.max(ray.x1, ray.x2), type: 'gray' });
            } else {
                vWalls.push({ x: ray.x1, y1: Math.min(ray.y1, ray.y2), y2: Math.max(ray.y1, ray.y2), type: 'gray' });
            }
        };

        sourcePoints.forEach(p => {
            let bestRay = null;
            let minDist = Infinity;
            p.dirs.forEach(dir => {
                const ray = castRay(p.x, p.y, dir);
                if (ray && ray.dist < minDist) { minDist = ray.dist; bestRay = { ...ray, sourceId: p.id, sourceType: 'entity' }; }
            });
            if (bestRay) commitRay(bestRay);
        });

        knees.forEach(k => {
            let bestRay = null;
            let minDist = Infinity;
            k.freeDirs.forEach(dir => {
                const ray = castRay(k.x, k.y, dir);
                if (ray && ray.dist < minDist) { minDist = ray.dist; bestRay = { ...ray, sourceId: k.relId, sourceType: 'relationship' }; }
            });
            if (bestRay) commitRay(bestRay);
        });

        return lines;
    }, [getBlockDims]);

    // --- Selection Logic ---
    const getEntityContext = useCallback((entityId) => {
        const relatedEdges = relationships.filter(r => r.source === entityId || r.target === entityId);
        const relatedEntityIds = new Set([entityId]);
        const relatedEdgeIds = new Set();

        // Add all nodes in the 1-degree neighborhood
        relatedEdges.forEach(r => {
            relatedEntityIds.add(r.source);
            relatedEntityIds.add(r.target);
        });

        // Add all existing edges between any nodes within this 1-degree neighborhood
        relationships.forEach(r => {
            if (relatedEntityIds.has(r.source) && relatedEntityIds.has(r.target)) {
                relatedEdgeIds.add(`${r.source}-${r.target}`);
            }
        });

        return { entities: relatedEntityIds, relationships: relatedEdgeIds };
    }, [relationships]);

    const getEdgeContext = useCallback((rel) => {
        return {
            entities: new Set([rel.source, rel.target]),
            relationships: new Set([`${rel.source}-${rel.target}`])
        };
    }, []);

    useEffect(() => {
        setSelection({ entities: new Set(), relationships: new Set() });
    }, [entities, relationships]);

    // Notify parent about selection changes (for AI Explain panel)
    useEffect(() => {
        if (onSelectionChange) {
            const selectedEntityList = entities.filter(e => selection.entities.has(e.id));
            onSelectionChange(selectedEntityList, selection);
        }
    }, [selection, entities, onSelectionChange]);

    const handleEntityClick = (e, entityId) => {
        e.stopPropagation();
        const context = getEntityContext(entityId);
        if (e.ctrlKey || e.metaKey) {
            setSelection(prev => {
                const newEntities = new Set(prev.entities);
                const newRelationships = new Set(prev.relationships);
                const isSelected = prev.entities.has(entityId);
                if (isSelected) {
                    context.entities.forEach(id => newEntities.delete(id));
                    context.relationships.forEach(id => newRelationships.delete(id));
                } else {
                    context.entities.forEach(id => newEntities.add(id));
                    context.relationships.forEach(id => newRelationships.add(id));
                }
                return { entities: newEntities, relationships: newRelationships };
            });
        } else {
            setSelection(context);
        }
    };

    const handleEdgeClick = (e, rel) => {
        e.stopPropagation();
        const context = getEdgeContext(rel);
        const relId = `${rel.source}-${rel.target}`;
        if (e.ctrlKey || e.metaKey) {
            setSelection(prev => {
                const newEntities = new Set(prev.entities);
                const newRelationships = new Set(prev.relationships);
                const isSelected = prev.relationships.has(relId);
                if (isSelected) {
                    context.entities.forEach(id => newEntities.delete(id));
                    context.relationships.forEach(id => newRelationships.delete(id));
                } else {
                    context.entities.forEach(id => newEntities.add(id));
                    context.relationships.forEach(id => newRelationships.add(id));
                }
                return { entities: newEntities, relationships: newRelationships };
            });
        } else {
            setSelection(context);
        }
    };

    const handleBackgroundClick = () => {
        setSelection({ entities: new Set(), relationships: new Set() });
        if (contextMenu) setContextMenu(null);
    };

    const getDownloadTargetIds = useCallback((clickedId) => {
        if (selection.entities.has(clickedId)) {
            return Array.from(selection.entities);
        }
        return [clickedId];
    }, [selection.entities]);

    const handleDownloadSelectedJSON = useCallback((clickedId) => {
        const targetIds = getDownloadTargetIds(clickedId);
        const targetIdSet = new Set(targetIds);
        const targets = entities.filter(e => targetIdSet.has(e.id));

        const selectedRelationships = relationships.filter(r =>
            targetIdSet.has(r.source) && targetIdSet.has(r.target)
        );

        const filename = targetIds.length > 1 ? 'enrichment_results_selection.json' : `enrichment_results_${clickedId.replace(':', '_')}.json`;

        downloadEnrichmentJSON(targets, selectedRelationships, metadata, filename);
    }, [getDownloadTargetIds, entities, relationships, metadata]);

    // --- Main Drawing Function ---
    const drawMap = useCallback((targetSvg, drawData, isInteractive = false) => {
        const { drawEntities, drawRelationships, config } = drawData;
        const { selectionState } = config;
        const shouldDrawLabels = config.showAnnotations !== undefined ? config.showAnnotations : true;
        // Allow override dimensions for export (ZIP downloads with different canvas sizes)
        const drawWidth = config.overrideWidth || width;
        const drawHeight = config.overrideHeight || height;
        targetSvg.selectAll("*").remove();
        const group = targetSvg.append("g").attr("class", "content");
        const gridSize = 10;
        const snap = (val) => Math.round(val / gridSize) * gridSize;

        // Grid (removed per user request)

        // Build entity rectangles
        const entityRects = {};
        drawEntities.forEach(entity => {
            const dims = getBlockDims(entity);
            const w = dims.w;
            const h = dims.h;
            let rawX = entity.x - w / 2;
            let rawY = entity.y - h / 2;
            let rectX = Math.max(0, Math.min(drawWidth - w, snap(rawX)));
            let rectY = Math.max(0, Math.min(drawHeight - h, snap(rawY)));
            entityRects[entity.id] = {
                x: rectX, y: rectY, width: w, height: h,
                color: getColor(entity), id: entity.id,
                name: entity.name || '',
                gene_count: entity.gene_count || 0,
                genes: entity.genes || [],
                significance_score: entity.significance_score || 0,
                direction: entity.direction || '',
                layer: entity.layer,
            };
        });

        const getOpacity = (type, id, unselectedAlpha = 0.1) => {
            if (!selectionState || (selectionState.entities.size === 0 && selectionState.relationships.size === 0)) return 1;
            const isSelected = type === 'entity' ? selectionState.entities.has(id) : selectionState.relationships.has(id);
            return isSelected ? 1 : unselectedAlpha;
        };

        // Mondrian lines
        const mondrianLines = generateMondrianLines(drawEntities, drawRelationships, drawWidth, drawHeight);
        const subdivisionGroup = group.append("g").attr("class", "subdivision");
        subdivisionGroup.selectAll("line").data(mondrianLines).enter().append("line")
            .attr("x1", d => d.x1).attr("y1", d => d.y1).attr("x2", d => d.x2).attr("y2", d => d.y2)
            .attr("stroke", "#D3D3D3").attr("stroke-width", 3).attr("stroke-linecap", "square")
            .attr("opacity", () => (selectionState && (selectionState.entities.size > 0 || selectionState.relationships.size > 0)) ? 0 : 1)
            .style("transition", "opacity 0.2s ease");

        // Draw relationships — also collect crosstalk line segments for label scoring
        const crosstalkSegments = [];
        drawRelationships.forEach(rel => {
            const relId = `${rel.source}-${rel.target}`;
            const sRect = entityRects[rel.source];
            const tRect = entityRects[rel.target];
            if (!sRect || !tRect) return;
            const getCorners = (r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x, y: r.y + r.height }, { x: r.x + r.width, y: r.y + r.height }];
            let best = { s: getCorners(sRect)[0], t: getCorners(tRect)[0], dist: Infinity };
            getCorners(sRect).forEach(s => getCorners(tRect).forEach(t => { const dist = Math.hypot(s.x - t.x, s.y - t.y); if (dist < best.dist) best = { s, t, dist }; }));

            // Collect the two line segments of the L-shaped crosstalk path
            crosstalkSegments.push(
                { x1: best.s.x, y1: best.s.y, x2: best.t.x, y2: best.s.y }, // horizontal leg
                { x1: best.t.x, y1: best.s.y, x2: best.t.x, y2: best.t.y }, // vertical leg
            );

            const path = group.append("path")
                .attr("d", `M ${best.s.x} ${best.s.y} L ${best.t.x} ${best.s.y} L ${best.t.x} ${best.t.y}`)
                .attr("fill", "none").attr("stroke", "#1D1D1D").attr("stroke-width", 3)
                .attr("opacity", getOpacity('relationship', relId, 0))   // unselected crosstalks fully hidden
                .style("cursor", isInteractive ? "pointer" : "default").style("transition", "opacity 0.2s ease");

            if (isInteractive) {
                path.on("click", (e) => handleEdgeClick(e, rel));
                const sName = sRect.name || rel.source;
                const tName = tRect.name || rel.target;
                const tooltipText = rel.weight
                    ? `${sName} ↔ ${tName} (JI: ${rel.weight.toFixed(2)})`
                    : `${sName} - ${tName}`;
                path.append("title").text(tooltipText);
            }
        });

        // Draw entity rectangles (without labels — labels rendered in a final pass)
        const entityGroups = {};
        Object.values(entityRects).forEach(rect => {
            const g = group.append("g")
                .attr("opacity", getOpacity('entity', rect.id))
                .style("cursor", isInteractive ? "pointer" : "default")
                .style("transition", "opacity 0.2s ease");
            if (isInteractive) {
                g.on("click", (e) => handleEntityClick(e, rect.id));
                g.on("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        entityId: rect.id
                    });
                });
            }

            g.append("rect")
                .attr("x", rect.x).attr("y", rect.y)
                .attr("width", rect.width).attr("height", rect.height)
                .attr("fill", rect.color)
                .attr("stroke", "#1D1D1D").attr("stroke-width", 3);

            // Tooltip
            const tooltipParts = [];
            const termName = rect.name ? rect.name : (rect.id.split('-')[1] || rect.id);
            const termId = rect.id;
            const title = `${termName} (${termId})`;
            tooltipParts.push(title);
            tooltipParts.push('—'.repeat(Math.floor(title.length * 0.5)));

            const dirStr = rect.direction || 'unknown';
            const sigStr = rect.significance_score ? rect.significance_score.toFixed(2) : 'N/A';
            tooltipParts.push(`${dirStr} (-log10(p): ${sigStr})`);
            if (rect.layer != null) {
                tooltipParts.push(`# layer: ${rect.layer}`);
            }

            tooltipParts.push(`# genes: ${rect.gene_count || 0}`);

            if (rect.genes && rect.genes.length > 0) {
                tooltipParts.push(`geneset: ${rect.genes.join(', ')}`);
            }
            g.append("title").text(tooltipParts.join('\n'));

            entityGroups[rect.id] = g;
        });

        // Canvas border
        group.append("rect").attr("x", 0).attr("y", 0).attr("width", drawWidth).attr("height", drawHeight)
            .attr("fill", "none").attr("stroke", "#1D1D1D").attr("stroke-width", 8);

        // ═══════════════════════════════════════════════════════
        // LABEL PASS — Publication-ready smart placement
        // ═══════════════════════════════════════════════════════
        if (!shouldDrawLabels) return group;
        const labelGroup = group.append("g").attr("class", "labels");
        const allRects = Object.values(entityRects);
        const CW = 0.55;      // char-width factor relative to font size
        const padH = 4;        // horizontal padding inside pill
        const padV = 2;        // vertical padding inside pill
        const gap = 6;         // gap between block edge and label
        const lineH = 1.25;    // line-height multiplier

        // Density-adaptive font size base
        const entityCount = allRects.length;
        const fontBase = entityCount > 80 ? 7 : entityCount > 40 ? 8 : 9;
        const fontMax = entityCount > 80 ? 10 : entityCount > 40 ? 12 : 14;

        // ── Helpers ──

        const boxesOverlap = (a, b) =>
            a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

        /** Test if a line segment intersects a box */
        const segmentCrossesBox = (seg, box) => {
            const isH = (seg.y1 === seg.y2);
            if (isH) {
                if (seg.y1 < box.y || seg.y1 > box.y + box.h) return false;
                const minX = Math.min(seg.x1, seg.x2);
                const maxX = Math.max(seg.x1, seg.x2);
                return maxX > box.x && minX < box.x + box.w;
            } else {
                if (seg.x1 < box.x || seg.x1 > box.x + box.w) return false;
                const minY = Math.min(seg.y1, seg.y2);
                const maxY = Math.max(seg.y1, seg.y2);
                return maxY > box.y && minY < box.y + box.h;
            }
        };

        /**
         * Smart line-breaking: produce balanced multi-line splits.
         * Rules:
         *  - 1 line if text fits within targetW
         *  - 2 lines if text is longer, choosing the split that minimises max-line-width
         *  - 3 lines only for very long names (>= 5 words)
         *  - Never split a 1–2 letter word ("of", "to", "by", "in") to the start of a new line
         *    unless it's followed by more words on the same line.
         */
        const smartLineBreak = (text, targetCharsPerLine) => {
            const words = text.split(' ');
            if (words.length <= 1 || text.length <= targetCharsPerLine) return [text];

            // Try 2-line splits: pick the most balanced
            let best2 = null, best2Max = Infinity;
            for (let i = 1; i < words.length; i++) {
                const l1 = words.slice(0, i).join(' ');
                const l2 = words.slice(i).join(' ');
                const mx = Math.max(l1.length, l2.length);
                if (mx < best2Max) { best2Max = mx; best2 = [l1, l2]; }
            }

            // Try 3-line splits for long names
            if (words.length >= 5 && text.length > targetCharsPerLine * 1.8) {
                let best3 = null, best3Max = Infinity;
                for (let i = 1; i < words.length - 1; i++) {
                    for (let j = i + 1; j < words.length; j++) {
                        const l1 = words.slice(0, i).join(' ');
                        const l2 = words.slice(i, j).join(' ');
                        const l3 = words.slice(j).join(' ');
                        const mx = Math.max(l1.length, l2.length, l3.length);
                        if (mx < best3Max) { best3Max = mx; best3 = [l1, l2, l3]; }
                    }
                }
                // Use 3-line only if it meaningfully reduces max line width
                if (best3 && best3Max < best2Max * 0.8) return best3;
            }

            return best2 || [text];
        };

        /** Compute multi-line label dimensions in SVG units */
        const labelDims = (lines, fs) => {
            const maxLineChars = Math.max(...lines.map(l => l.length));
            const w = maxLineChars * fs * CW + padH * 2;
            const h = lines.length * fs * lineH + padV * 2;
            return { w, h };
        };

        /**
         * Build 8 candidate positions around a rect.
         * Returns { tx, ty, anchor, px, py } for each.
         * tx/ty = text anchor point; px/py = pill top-left
         */
        const buildCandidates = (rect, lw, lh, fs, numLines) => {
            const firstLineY = padV + fs * 0.85; // baseline of first line relative to pill top
            return [
                { // TOP CENTER
                    name: 'tc',
                    tx: rect.x + rect.width / 2, ty: rect.y - gap - lh + firstLineY,
                    anchor: 'middle',
                    px: rect.x + rect.width / 2 - lw / 2, py: rect.y - gap - lh,
                },
                { // BOTTOM CENTER
                    name: 'bc',
                    tx: rect.x + rect.width / 2, ty: rect.y + rect.height + gap + firstLineY,
                    anchor: 'middle',
                    px: rect.x + rect.width / 2 - lw / 2, py: rect.y + rect.height + gap,
                },
                { // RIGHT
                    name: 'r',
                    tx: rect.x + rect.width + gap + padH, ty: rect.y + rect.height / 2 - lh / 2 + firstLineY,
                    anchor: 'start',
                    px: rect.x + rect.width + gap, py: rect.y + rect.height / 2 - lh / 2,
                },
                { // LEFT
                    name: 'l',
                    tx: rect.x - gap - padH, ty: rect.y + rect.height / 2 - lh / 2 + firstLineY,
                    anchor: 'end',
                    px: rect.x - gap - lw, py: rect.y + rect.height / 2 - lh / 2,
                },
                { // TOP-LEFT (text left-aligned at block's left edge, above)
                    name: 'tl',
                    tx: rect.x + padH, ty: rect.y - gap - lh + firstLineY,
                    anchor: 'start',
                    px: rect.x, py: rect.y - gap - lh,
                },
                { // TOP-RIGHT (text right-aligned at block's right edge, above)
                    name: 'tr',
                    tx: rect.x + rect.width - padH, ty: rect.y - gap - lh + firstLineY,
                    anchor: 'end',
                    px: rect.x + rect.width - lw, py: rect.y - gap - lh,
                },
                { // BOTTOM-LEFT
                    name: 'bl',
                    tx: rect.x + padH, ty: rect.y + rect.height + gap + firstLineY,
                    anchor: 'start',
                    px: rect.x, py: rect.y + rect.height + gap,
                },
                { // BOTTOM-RIGHT
                    name: 'br',
                    tx: rect.x + rect.width - padH, ty: rect.y + rect.height + gap + firstLineY,
                    anchor: 'end',
                    px: rect.x + rect.width - lw, py: rect.y + rect.height + gap,
                },
            ];
        };

        /**
         * Score a candidate position. Lower is better.
         * Priority: whitespace (0) < gray lines (1) < crosstalks (5) < GO Terms (15)
         */
        const scoreCandidate = (c, lw, lh, idx, placedBoxes) => {
            let score = idx * 0.01; // tiny tie-breaker for position preference
            const box = { x: c.px, y: c.py, w: lw, h: lh };

            // Out of canvas bounds — strongly penalised
            if (box.x < -2 || box.y < -2 ||
                box.x + box.w > drawWidth + 2 || box.y + box.h > drawHeight + 2) {
                score += 100;
            }

            // Overlap with GO Term blocks (least preferred)
            allRects.forEach(other => {
                if (boxesOverlap(box, { x: other.x, y: other.y, w: other.width, h: other.height })) {
                    score += 15;
                }
            });

            // Overlap with already-placed labels
            placedBoxes.forEach(placed => {
                if (boxesOverlap(box, placed)) {
                    score += 12;
                }
            });

            // Overlap with crosstalks (black edge lines — scientifically meaningful)
            crosstalkSegments.forEach(seg => {
                if (segmentCrossesBox(seg, box)) score += 5;
            });

            // Overlap with gray subdivision lines (no scientific meaning)
            mondrianLines.forEach(seg => {
                if (segmentCrossesBox(seg, box)) score += 1;
            });

            return score;
        };

        // ── Place labels ──
        const placedLabelBoxes = [];

        // Sort by significance (most significant first) — they get priority placement
        const sortedRects = [...allRects].sort((a, b) =>
            (b.significance_score || 0) - (a.significance_score || 0)
        );

        sortedRects.forEach(rect => {
            const opacity = getOpacity('entity', rect.id);

            // Adaptive font size
            const fontSize = isRealData
                ? Math.max(fontBase, Math.min(fontMax, rect.width / 4))
                : 10;

            // Full term name by default
            const fullName = (isRealData && rect.name) ? rect.name : (rect.id.split('-')[1] || rect.id);

            // Target chars per line ≈ proportional to block width
            const targetCharsPerLine = Math.max(12, Math.round(rect.width * 1.5 / (fontSize * CW)));

            // Build full-name multi-line layout
            const lines = smartLineBreak(fullName, targetCharsPerLine);
            const dims = labelDims(lines, fontSize);
            const candidates = buildCandidates(rect, dims.w, dims.h, fontSize, lines.length);

            // Score all 8 positions with full name
            let bestIdx = 0, bestScore = Infinity;
            candidates.forEach((c, idx) => {
                const s = scoreCandidate(c, dims.w, dims.h, idx, placedLabelBoxes);
                if (s < bestScore) { bestScore = s; bestIdx = idx; }
            });

            let finalLines = lines;
            let finalDims = dims;
            let finalCandidate = candidates[bestIdx];

            // If best position overlaps GO Terms (score >= 15), try a concise version
            if (bestScore >= 15 && fullName.length > 20) {
                const concise = fullName.length > 20
                    ? fullName.substring(0, 18).trimEnd() + '…'
                    : fullName;
                const cLines = [concise]; // single line for concise
                const cDims = labelDims(cLines, fontSize);
                const cCandidates = buildCandidates(rect, cDims.w, cDims.h, fontSize, 1);

                let cBestIdx = 0, cBestScore = Infinity;
                cCandidates.forEach((c, idx) => {
                    const s = scoreCandidate(c, cDims.w, cDims.h, idx, placedLabelBoxes);
                    if (s < cBestScore) { cBestScore = s; cBestIdx = idx; }
                });

                // Use concise only if it actually scores better
                if (cBestScore < bestScore) {
                    finalLines = cLines;
                    finalDims = cDims;
                    finalCandidate = cCandidates[cBestIdx];
                    bestScore = cBestScore;
                }
            }

            // Register the placed bounding box
            placedLabelBoxes.push({
                x: finalCandidate.px, y: finalCandidate.py,
                w: finalDims.w, h: finalDims.h,
            });

            // ── Render ──
            const lg = labelGroup.append("g").attr("opacity", opacity);

            // White background pill
            lg.append("rect")
                .attr("x", finalCandidate.px)
                .attr("y", finalCandidate.py)
                .attr("width", finalDims.w)
                .attr("height", finalDims.h)
                .attr("rx", 2).attr("ry", 2)
                .attr("fill", "white")
                .attr("opacity", 0.88);

            // Multi-line text using tspan
            const textEl = lg.append("text")
                .attr("x", finalCandidate.tx)
                .attr("y", finalCandidate.ty)
                .attr("text-anchor", finalCandidate.anchor)
                .attr("fill", "#1D1D1D")
                .attr("font-size", `${fontSize}px`)
                .attr("font-family", "'Inter', 'Helvetica Neue', sans-serif")
                .attr("font-weight", "600")
                .attr("letter-spacing", "0.01em");

            finalLines.forEach((line, i) => {
                textEl.append("tspan")
                    .attr("x", finalCandidate.tx)
                    .attr("dy", i === 0 ? 0 : `${fontSize * lineH}px`)
                    .text(line);
            });

            // Interactive: clickable label
            if (isInteractive) {
                lg.style("cursor", "pointer");
                lg.on("click", (e) => handleEntityClick(e, rect.id));
            }
        });

        return group;
    }, [relationships, width, height, selection, getEntityContext, getEdgeContext, generateMondrianLines, getBlockDims, getColor, isRealData]);

    // --- Render & Zoom ---
    // Debounce ref for layer-zoom via scroll wheel
    const layerZoomTimerRef = useRef(null);
    const lastLayerZoomRef = useRef(0);

    useEffect(() => {
        const svg = d3.select(svgRef.current);
        if (!layoutEntities || layoutEntities.length === 0 || !relationships) {
            svg.selectAll("*").remove();
            return;
        }
        const contentGroup = drawMap(svg, { drawEntities: layoutEntities, drawRelationships: relationships, config: { selectionState: selection, showAnnotations } }, true);

        // Within-layer zoom (only active when Ctrl is held)
        const zoom = d3.zoom()
            .scaleExtent([0.1, 5])
            .filter((event) => {
                // Allow all non-wheel events (pan, pinch, etc.)
                if (event.type !== 'wheel') return true;
                // For wheel events: only allow zoom when Ctrl is held
                return event.ctrlKey || event.metaKey;
            })
            .on("zoom", (event) => contentGroup.attr("transform", event.transform));
        svg.call(zoom);

        // Layer-based zoom via scroll wheel (default, without Ctrl)
        const handleWheel = (event) => {
            // Only handle when Ctrl is NOT held (Ctrl+scroll is within-layer zoom)
            if (event.ctrlKey || event.metaKey) return;
            // Prevent default page scroll
            event.preventDefault();

            if (!onLayerZoom) return;

            // Debounce: only fire once per 250ms
            const now = Date.now();
            if (now - lastLayerZoomRef.current < 250) return;
            lastLayerZoomRef.current = now;

            // Reversed direction:
            // deltaY > 0 = scroll down = zoom out = higher layer
            // deltaY < 0 = scroll up = zoom in = lower layer
            const direction = event.deltaY > 0 ? 1 : -1;
            onLayerZoom(direction);
        };

        const svgEl = svgRef.current;
        if (svgEl) {
            svgEl.addEventListener('wheel', handleWheel, { passive: false });
        }

        const centerMap = () => {
            if (!containerRef.current) return;
            const cw = containerRef.current.clientWidth;
            const ch = containerRef.current.clientHeight;
            if (cw === 0 || ch === 0) return;
            const scale = Math.min(cw / width, ch / height) * 0.9;
            const tx = (cw - width * scale) / 2;
            const ty = (ch - height * scale) / 2;
            svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
        };
        centerMap();
        const resizeObserver = new ResizeObserver(() => centerMap());
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return () => {
            resizeObserver.disconnect();
            if (svgEl) svgEl.removeEventListener('wheel', handleWheel);
        };
    }, [layoutEntities, relationships, width, height, selection, drawMap, onLayerZoom, showAnnotations]);

    // --- SVG Export ---
    const getSVGContent = useCallback((mode, customEntities = null, customRelationships = null, customWidth = null, customHeight = null) => {
        let dlEntities = customEntities ? resolveLayout(customEntities) : layoutEntities;
        let dlRelationships = customRelationships || relationships;

        if (mode === 'selection' && !customEntities) {
            dlEntities = layoutEntities.filter(e => selection.entities.has(e.id));
            dlRelationships = relationships.filter(r => selection.relationships.has(`${r.source}-${r.target}`));
        }

        // Use custom dimensions if provided (for ZIP downloads with different canvas sizes per layer)
        const exportWidth = customWidth || width;
        const exportHeight = customHeight || height;

        const hiddenSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        hiddenSvg.setAttribute("width", exportWidth);
        hiddenSvg.setAttribute("height", exportHeight);
        hiddenSvg.setAttribute("viewBox", `0 0 ${exportWidth} ${exportHeight}`);
        hiddenSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const d3Svg = d3.select(hiddenSvg);

        drawMap(d3Svg, {
            drawEntities: dlEntities,
            drawRelationships: dlRelationships,
            config: { selectionState: null, overrideWidth: exportWidth, overrideHeight: exportHeight, showAnnotations }
        }, false);

        const serializer = new XMLSerializer();
        return serializer.serializeToString(hiddenSvg);
    }, [layoutEntities, relationships, selection, drawMap, width, height, resolveLayout, showAnnotations]);

    const handleDownload = useCallback((mode, customFilename = null) => {
        const svgString = getSVGContent(mode);
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = customFilename || `mondrian_map_${mode}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [getSVGContent]);

    /**
     * Imperative handles for direct map control from parent components.
     * toggleSelection: allows table-based selection to sync with canvas state.
     */
    useImperativeHandle(ref, () => ({
        downloadMap: handleDownload,
        getSVG: getSVGContent,
        toggleSelection: (type, id, isMulti = false) => {
            if (type === 'node') {
                const context = getEntityContext(id);
                if (isMulti) {
                    setSelection(prev => {
                        const newEntities = new Set(prev.entities);
                        const newRelationships = new Set(prev.relationships);
                        const isSelected = prev.entities.has(id);
                        if (isSelected) {
                            context.entities.forEach(eid => newEntities.delete(eid));
                            context.relationships.forEach(rid => newRelationships.delete(rid));
                        } else {
                            context.entities.forEach(eid => newEntities.add(eid));
                            context.relationships.forEach(rid => newRelationships.add(rid));
                        }
                        return { entities: newEntities, relationships: newRelationships };
                    });
                } else {
                    setSelection(context);
                }
            } else if (type === 'edge') {
                const edgeId = typeof id === 'string' ? id : `${id.source}-${id.target}`;
                const rel = relationships.find(r => `${r.source}-${r.target}` === edgeId);
                if (!rel) return;
                const context = getEdgeContext(rel);
                if (isMulti) {
                    setSelection(prev => {
                        const newEntities = new Set(prev.entities);
                        const newRelationships = new Set(prev.relationships);
                        const isSelected = prev.relationships.has(edgeId);
                        if (isSelected) {
                            context.entities.forEach(eid => newEntities.delete(eid));
                            context.relationships.forEach(rid => newRelationships.delete(rid));
                        } else {
                            context.entities.forEach(eid => newEntities.add(eid));
                            context.relationships.forEach(rid => newRelationships.add(rid));
                        }
                        return { entities: newEntities, relationships: newRelationships };
                    });
                } else {
                    setSelection(context);
                }
            }
        }
    }), [handleDownload, getSVGContent, getEntityContext, getEdgeContext, relationships]);

    return (
        <div ref={containerRef} className="w-full h-screen overflow-hidden bg-gray-100 relative" style={{ willChange: 'transform' }} onClick={() => contextMenu && setContextMenu(null)} onContextMenu={(e) => { if (contextMenu) { e.preventDefault(); setContextMenu(null); } }}>
            <svg id="mondrian-map-svg" ref={svgRef} className="w-full h-full block cursor-grab active:cursor-grabbing" onClick={handleBackgroundClick} />

            {contextMenu && (
                <div
                    className="fixed bg-white shadow-lg border border-gray-200 rounded py-1 z-50 text-sm w-72 text-black"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                        onClick={() => { handleDownloadSelectedJSON(contextMenu.entityId); setContextMenu(null); }}
                    >
                        Download Enrichment Results (.json)
                    </button>
                </div>
            )}

            {/* Loading spinner overlay */}
            {isLoading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 pointer-events-none">
                    <div className="flex flex-col items-center gap-4">
                        <svg
                            className="animate-spin"
                            width="40"
                            height="40"
                            viewBox="0 0 40 40"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <circle cx="20" cy="20" r="16" stroke="#E5E5E5" strokeWidth="4" />
                            <path
                                d="M20 4a16 16 0 0 1 16 16"
                                stroke="#1D1D1D"
                                strokeWidth="4"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-bold text-black tracking-widest uppercase">Running Analysis</span>
                            <span className="text-[10px] text-gray-400 tracking-wider">Enrichment · Embeddings · Layout</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MondrianMap;
