import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const MondrianMap = ({ entities, relationships, width = 1000, height = 1000 }) => {
    const svgRef = useRef(null);

    useEffect(() => {
        if (!entities || !relationships) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous render

        // Constants
        const gridSize = 10; // 10x10 squares

        // Helper to snap to grid
        const snap = (val) => Math.round(val / gridSize) * gridSize;

        // 1. Draw Grid (Step 1)
        const drawGrid = () => {
            // Light grid lines
            svg.append("g")
                .attr("class", "grid")
                .selectAll("line")
                .data(d3.range(0, width + 1, gridSize))
                .enter().append("line")
                .attr("x1", d => d)
                .attr("y1", 0)
                .attr("x2", d => d)
                .attr("y2", height)
                .attr("stroke", "#F0F0F0")
                .attr("stroke-width", 1);

            svg.append("g")
                .attr("class", "grid")
                .selectAll("line")
                .data(d3.range(0, height + 1, gridSize))
                .enter().append("line")
                .attr("x1", 0)
                .attr("y1", d => d)
                .attr("x2", width)
                .attr("y2", d => d)
                .attr("stroke", "#F0F0F0")
                .attr("stroke-width", 1);
        };
        drawGrid();

        // Pre-calculate entity geometries (rects)
        const entityRects = {};
        entities.forEach(entity => {
            const scaleFactor = 30;
            let size = Math.abs(entity.foldChange) * scaleFactor;
            let snappedSize = Math.max(gridSize, Math.round(size / gridSize) * gridSize);

            let rawX = entity.x - snappedSize / 2;
            let rawY = entity.y - snappedSize / 2;

            let rectX = snap(rawX);
            let rectY = snap(rawY);

            rectX = Math.max(0, Math.min(width - snappedSize, rectX));
            rectY = Math.max(0, Math.min(height - snappedSize, rectY));

            entityRects[entity.id] = {
                x: rectX,
                y: rectY,
                width: snappedSize,
                height: snappedSize,
                color: getColor(entity),
                id: entity.id
            };
        });

        // 3. Draw Relationships (Step 3)
        relationships.forEach(rel => {
            const sourceRect = entityRects[rel.source];
            const targetRect = entityRects[rel.target];
            if (!sourceRect || !targetRect) return;

            const getCorners = (r) => [
                { x: r.x, y: r.y }, // TL
                { x: r.x + r.width, y: r.y }, // TR
                { x: r.x, y: r.y + r.height }, // BL
                { x: r.x + r.width, y: r.y + r.height } // BR
            ];

            const sCorners = getCorners(sourceRect);
            const tCorners = getCorners(targetRect);

            let minDist = Infinity;
            let bestS = sCorners[0];
            let bestT = tCorners[0];

            sCorners.forEach(s => {
                tCorners.forEach(t => {
                    const dist = Math.hypot(s.x - t.x, s.y - t.y);
                    if (dist < minDist) {
                        minDist = dist;
                        bestS = s;
                        bestT = t;
                    }
                });
            });

            const pathData = `M ${bestS.x} ${bestS.y} L ${bestT.x} ${bestS.y} L ${bestT.x} ${bestT.y}`;

            svg.append("path")
                .attr("d", pathData)
                .attr("fill", "none")
                .attr("stroke", "#1D1D1D")
                .attr("stroke-width", 4)
                .append("title") // Tooltip
                .text(`${rel.source} - ${rel.target}`);
        });

        // 2. Draw Entities (Step 2)
        Object.values(entityRects).forEach(rect => {
            svg.append("rect")
                .attr("x", rect.x)
                .attr("y", rect.y)
                .attr("width", rect.width)
                .attr("height", rect.height)
                .attr("fill", rect.color)
                .attr("stroke", "#1D1D1D")
                .attr("stroke-width", 3)
                .append("title") // Tooltip
                .text(rect.id);
        });

        // 4. Art Style (Step 4) - Only Border
        svg.append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", width)
            .attr("height", height)
            .attr("fill", "none")
            .attr("stroke", "#1D1D1D")
            .attr("stroke-width", 8);

    }, [entities, relationships, width, height]);

    return (
        <div className="overflow-auto max-w-full max-h-screen p-4 bg-gray-100 flex justify-center">
            <div className="bg-white shadow-2xl inline-block" style={{ width: width, height: height }}>
                <svg ref={svgRef} width={width} height={height} />
            </div>
        </div>
    );
};

// Helper for color
const getColor = (entity) => {
    const p = entity.pValue;
    const fc = entity.foldChange;
    if (p < 0.05) {
        if (fc >= 1.25) return '#E30022'; // Red
        if (fc <= 0.75) return '#0078BF'; // Blue
        return '#FFD700'; // Yellow
    }
    return '#1D1D1D'; // Black
};

export default MondrianMap;
