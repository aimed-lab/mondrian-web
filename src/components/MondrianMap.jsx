import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

const MondrianMap = forwardRef(function MondrianMap({ entities, relationships, width = 1000, height = 1000, parameters = {}, dataSource = 'real', isLoading = false, onSelectionChange = null, onLayerZoom = null }, ref) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [selection, setSelection] = useState({ entities: new Set(), relationships: new Set() });
    const [layoutEntities, setLayoutEntities] = useState([]);

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

    useEffect(() => {
        setLayoutEntities(resolveLayout(entities));
    }, [entities, resolveLayout]);

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
    };

    // --- Main Drawing Function ---
    const drawMap = useCallback((targetSvg, drawData, isInteractive = false) => {
        const { drawEntities, drawRelationships, config } = drawData;
        const { selectionState } = config;
        targetSvg.selectAll("*").remove();
        const group = targetSvg.append("g").attr("class", "content");
        const gridSize = 10;
        const snap = (val) => Math.round(val / gridSize) * gridSize;

        // Grid
        const gridGroup = group.append("g").attr("class", "grid");
        gridGroup.selectAll("line.v").data(d3.range(0, width + 1, gridSize)).enter().append("line")
            .attr("class", "v").attr("x1", d => d).attr("y1", 0).attr("x2", d => d).attr("y2", height)
            .attr("stroke", "#F0F0F0").attr("stroke-width", 1);
        gridGroup.selectAll("line.h").data(d3.range(0, height + 1, gridSize)).enter().append("line")
            .attr("class", "h").attr("x1", 0).attr("y1", d => d).attr("x2", width).attr("y2", d => d)
            .attr("stroke", "#F0F0F0").attr("stroke-width", 1);

        // Build entity rectangles
        const entityRects = {};
        drawEntities.forEach(entity => {
            const dims = getBlockDims(entity);
            const w = dims.w;
            const h = dims.h;
            let rawX = entity.x - w / 2;
            let rawY = entity.y - h / 2;
            let rectX = Math.max(0, Math.min(width - w, snap(rawX)));
            let rectY = Math.max(0, Math.min(height - h, snap(rawY)));
            entityRects[entity.id] = {
                x: rectX, y: rectY, width: w, height: h,
                color: getColor(entity), id: entity.id,
                name: entity.name || '',
                gene_count: entity.gene_count || 0,
                significance_score: entity.significance_score || 0,
                direction: entity.direction || '',
            };
        });

        const getOpacity = (type, id, unselectedAlpha = 0.1) => {
            if (!selectionState || (selectionState.entities.size === 0 && selectionState.relationships.size === 0)) return 1;
            const isSelected = type === 'entity' ? selectionState.entities.has(id) : selectionState.relationships.has(id);
            return isSelected ? 1 : unselectedAlpha;
        };

        // Mondrian lines
        const mondrianLines = generateMondrianLines(drawEntities, drawRelationships, width, height);
        const subdivisionGroup = group.append("g").attr("class", "subdivision");
        subdivisionGroup.selectAll("line").data(mondrianLines).enter().append("line")
            .attr("x1", d => d.x1).attr("y1", d => d.y1).attr("x2", d => d.x2).attr("y2", d => d.y2)
            .attr("stroke", "#D3D3D3").attr("stroke-width", 3).attr("stroke-linecap", "square")
            .attr("opacity", () => (selectionState && (selectionState.entities.size > 0 || selectionState.relationships.size > 0)) ? 0 : 1)
            .style("transition", "opacity 0.2s ease");

        // Draw relationships
        drawRelationships.forEach(rel => {
            const relId = `${rel.source}-${rel.target}`;
            const sRect = entityRects[rel.source];
            const tRect = entityRects[rel.target];
            if (!sRect || !tRect) return;
            const getCorners = (r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x, y: r.y + r.height }, { x: r.x + r.width, y: r.y + r.height }];
            let best = { s: getCorners(sRect)[0], t: getCorners(tRect)[0], dist: Infinity };
            getCorners(sRect).forEach(s => getCorners(tRect).forEach(t => { const dist = Math.hypot(s.x - t.x, s.y - t.y); if (dist < best.dist) best = { s, t, dist }; }));
            const path = group.append("path")
                .attr("d", `M ${best.s.x} ${best.s.y} L ${best.t.x} ${best.s.y} L ${best.t.x} ${best.t.y}`)
                .attr("fill", "none").attr("stroke", "#1D1D1D").attr("stroke-width", 3)
                .attr("opacity", getOpacity('relationship', relId, 0))   // unselected crosstalks fully hidden
                .style("cursor", isInteractive ? "pointer" : "default").style("transition", "opacity 0.2s ease");

            if (isInteractive) {
                path.on("click", (e) => handleEdgeClick(e, rel));
                const tooltipText = rel.weight
                    ? `${rel.source} ↔ ${rel.target} (Jaccard: ${rel.weight.toFixed(3)})`
                    : `${rel.source} - ${rel.target}`;
                path.append("title").text(tooltipText);
            }
        });

        // Draw entity rectangles
        Object.values(entityRects).forEach(rect => {
            const g = group.append("g")
                .attr("opacity", getOpacity('entity', rect.id))
                .style("cursor", isInteractive ? "pointer" : "default")
                .style("transition", "opacity 0.2s ease");

            if (isInteractive) g.on("click", (e) => handleEntityClick(e, rect.id));

            g.append("rect")
                .attr("x", rect.x).attr("y", rect.y)
                .attr("width", rect.width).attr("height", rect.height)
                .attr("fill", rect.color)
                .attr("stroke", "#1D1D1D").attr("stroke-width", 3);

            // Tooltip
            const tooltipParts = [rect.id];
            if (rect.name) tooltipParts.push(rect.name);
            if (rect.direction) tooltipParts.push(`Direction: ${rect.direction}`);
            if (rect.significance_score) tooltipParts.push(`-log10(p): ${rect.significance_score.toFixed(2)}`);
            if (rect.gene_count) tooltipParts.push(`Genes: ${rect.gene_count}`);
            g.append("title").text(tooltipParts.join('\n'));

            // Label
            const labelText = isRealData && rect.name
                ? (rect.name.length > 18 ? rect.name.substring(0, 16) + '...' : rect.name)
                : (rect.id.split('-')[1] || rect.id);
            const fontSize = isRealData ? Math.max(7, Math.min(10, rect.width / 6)) : 10;

            g.append("text")
                .attr("x", rect.x + rect.width / 2)
                .attr("y", rect.y - 4)
                .attr("text-anchor", "middle")
                .attr("fill", "#1D1D1D")
                .attr("font-size", `${fontSize}px`)
                .attr("font-family", "sans-serif")
                .attr("font-weight", "bold")
                .text(labelText);
        });

        // Canvas border
        group.append("rect").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
            .attr("fill", "none").attr("stroke", "#1D1D1D").attr("stroke-width", 8);

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
        const contentGroup = drawMap(svg, { drawEntities: layoutEntities, drawRelationships: relationships, config: { selectionState: selection } }, true);

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
    }, [layoutEntities, relationships, width, height, selection, drawMap, onLayerZoom]);

    // --- SVG Export ---
    const getSVGContent = useCallback((mode, customEntities = null, customRelationships = null) => {
        let dlEntities = customEntities ? resolveLayout(customEntities) : layoutEntities;
        let dlRelationships = customRelationships || relationships;

        if (mode === 'selection' && !customEntities) {
            dlEntities = layoutEntities.filter(e => selection.entities.has(e.id));
            dlRelationships = relationships.filter(r => selection.relationships.has(`${r.source}-${r.target}`));
        }

        const hiddenSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        hiddenSvg.setAttribute("width", width);
        hiddenSvg.setAttribute("height", height);
        hiddenSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const d3Svg = d3.select(hiddenSvg);

        drawMap(d3Svg, {
            drawEntities: dlEntities,
            drawRelationships: dlRelationships,
            config: { selectionState: null }
        }, false);

        const serializer = new XMLSerializer();
        return serializer.serializeToString(hiddenSvg);
    }, [layoutEntities, relationships, selection, drawMap, width, height, resolveLayout]);

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
    }), [handleDownload, getEntityContext, getEdgeContext, relationships]);

    return (
        <div ref={containerRef} className="w-full h-screen overflow-hidden bg-gray-100 relative">
            <svg id="mondrian-map-svg" ref={svgRef} className="w-full h-full block cursor-grab active:cursor-grabbing" onClick={handleBackgroundClick} />

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
