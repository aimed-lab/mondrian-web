import { v4 as uuidv4 } from 'uuid';

export const generateSyntheticData = (width = 800, height = 600, count = 10) => {
    const entities = [];
    const relationships = [];

    // Grid size
    const gridSize = 50;

    for (let i = 0; i < count; i++) {
        // Random grid-aligned coordinates
        const x = Math.floor(Math.random() * (width / gridSize)) * gridSize + gridSize / 2;
        const y = Math.floor(Math.random() * (height / gridSize)) * gridSize + gridSize / 2;

        entities.push({
            id: `entity-${i}`,
            x,
            y,
            area: Math.random() * 0.8 + 0.2, // 0.2 to 1.0 scale
            foldChange: Math.random() * 4 - 2, // -2 to 2
            pValue: Math.random() * 0.05, // Significant p-value
        });
    }

    // Generate some relationships
    for (let i = 0; i < count - 1; i++) {
        if (Math.random() > 0.7) {
            relationships.push({
                source: entities[i].id,
                target: entities[i + 1].id,
                type: Math.random() > 0.5 ? 'up-up' : 'down-down', // Simplified types
            });
        }
    }

    return { entities, relationships };
};
