import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const MondrianMap = ({ entities, relationships, width = 800, height = 600 }) => {
    const svgRef = useRef(null);

    useEffect(() => {
        if (!entities || !relationships) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous render

        // Constants
        const gridSize = 50;
        const padding = 20;

        // 1. Draw Grid (Step 1 & 4 - Base Canvas & Art Style)
        const drawGrid = () => {
            // Vertical lines
            for (let x = 0; x <= width; x += gridSize) {
                svg.append("line")
                    .attr("x1", x)
                    .attr("y1", 0)
                    .attr("x2", x)
                    .attr("y2", height)
                    .attr("stroke", "#F0F0F0")
                    .attr("stroke-width", 2);
            }
            // Horizontal lines
            for (let y = 0; y <= height; y += gridSize) {
                svg.append("line")
                    .attr("x1", 0)
                    .attr("y1", y)
                    .attr("x2", width)
                    .attr("y2", y)
                    .attr("stroke", "#F0F0F0")
                    .attr("stroke-width", 2);
            }
        };
        drawGrid();

        // 3. Draw Relationships (Step 3) - Drawn before rects to be behind? Or after?
        // Usually lines are behind nodes.
        // L-shaped lines.
        relationships.forEach(rel => {
            const source = entities.find(e => e.id === rel.source);
            const target = entities.find(e => e.id === rel.target);
            if (!source || !target) return;

            // Simple L-shape: Horizontal then Vertical
            const midX = target.x;

            const pathData = `M ${source.x} ${source.y} L ${midX} ${source.y} L ${target.x} ${target.y}`;

            svg.append("path")
                .attr("d", pathData)
                .attr("fill", "none")
                .attr("stroke", rel.type === 'up-up' ? '#E30022' : '#0078BF') // Red or Blue based on type
                .attr("stroke-width", 4);
        });

        // 2. Draw Entities (Step 2)
        // Rectangles centered at (x,y) with size based on area
        entities.forEach(entity => {
            const size = entity.area * gridSize * 1.5; // Scale factor
            const rectX = entity.x - size / 2;
            const rectY = entity.y - size / 2;

            // Color based on foldChange (Red=Up, Blue=Down, Yellow=Neutral)
            let color = '#FFD700'; // Yellow
            if (entity.foldChange > 0.5) color = '#E30022'; // Red
            if (entity.foldChange < -0.5) color = '#0078BF'; // Blue

            svg.append("rect")
                .attr("x", rectX)
                .attr("y", rectY)
                .attr("width", size)
                .attr("height", size)
                .attr("fill", color)
                .attr("stroke", "#1D1D1D")
                .attr("stroke-width", 3);

            // Add ID label
            svg.append("text")
                .attr("x", entity.x)
                .attr("y", entity.y)
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .attr("font-size", "10px")
                .attr("font-family", "sans-serif")
                .text(entity.id.split('-')[1]);
        });

        // 4. Decorative Lines (Step 4)
        // Add some random black lines on grid to mimic Mondrian
        for (let i = 0; i < 5; i++) {
            const isVertical = Math.random() > 0.5;
            if (isVertical) {
                const x = Math.floor(Math.random() * (width / gridSize)) * gridSize;
                svg.append("line")
                    .attr("x1", x)
                    .attr("y1", 0)
                    .attr("x2", x)
                    .attr("y2", height)
                    .attr("stroke", "#1D1D1D")
                    .attr("stroke-width", 4);
            } else {
                const y = Math.floor(Math.random() * (height / gridSize)) * gridSize;
                svg.append("line")
                    .attr("x1", 0)
                    .attr("y1", y)
                    .attr("x2", width)
                    .attr("y2", y)
                    .attr("stroke", "#1D1D1D")
                    .attr("stroke-width", 4);
            }
        }

    }, [entities, relationships, width, height]);

    return (
        <div className="border-4 border-black bg-white shadow-2xl">
            <svg ref={svgRef} width={width} height={height} />
        </div>
    );
};

export default MondrianMap;
