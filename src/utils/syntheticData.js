import { v4 as uuidv4 } from 'uuid';

export const generateSyntheticData = (width = 1000, height = 1000, count = 15) => {
    const entities = [];
    const relationships = [];

    // Grid size 10x10 squares
    const gridSize = 10;

    for (let i = 0; i < count; i++) {
        // Random grid-aligned coordinates
        // Ensure they are within bounds and not too close to edges
        const x = Math.floor(Math.random() * ((width - 100) / gridSize)) * gridSize + 50;
        const y = Math.floor(Math.random() * ((height - 100) / gridSize)) * gridSize + 50;

        // Generate attributes to cover all 4 cases
        const rand = Math.random();
        let foldChange, pValue;

        if (rand < 0.3) {
            // Red: Up-regulated (FC >= 1.25, p < 0.05)
            foldChange = 1.25 + Math.random() * 2;
            pValue = Math.random() * 0.049;
        } else if (rand < 0.6) {
            // Blue: Down-regulated (FC <= 0.75, p < 0.05)
            foldChange = 0.75 - Math.random() * 0.5; // 0.25 to 0.75
            pValue = Math.random() * 0.049;
        } else if (rand < 0.8) {
            // Yellow: Neutral/Other (p < 0.05, but FC between 0.75 and 1.25)
            foldChange = 0.76 + Math.random() * 0.48; // ~0.76 to 1.24
            pValue = Math.random() * 0.049;
        } else {
            // Black: Insignificant (p >= 0.05)
            foldChange = Math.random() * 4; // Any FC
            pValue = 0.05 + Math.random() * 0.5;
        }

        entities.push({
            id: `entity-${i}`,
            x,
            y,
            foldChange,
            pValue,
        });
    }

    // Generate relationships
    for (let i = 0; i < count - 1; i++) {
        if (Math.random() > 0.8) {
            relationships.push({
                source: entities[i].id,
                target: entities[i + 1].id,
                type: 'interaction',
            });
        }
    }

    return { entities, relationships };
};
