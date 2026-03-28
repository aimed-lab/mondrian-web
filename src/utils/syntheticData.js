import { v4 as uuidv4 } from 'uuid';

/**
 * Generates synthetic data for the Mondrian Map.
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} count - Number of entities to generate
 * @param {Array} goTerms - Optional array of GO terms (objects with 'ID' property) to sample from
 * @returns {Object} - { entities, relationships }
 */
export const generateSyntheticData = (width = 1000, height = 1000, count = 15, goTerms = null) => {
    const entities = [];
    const relationships = [];

    // Grid size 10x10 squares
    const gridSize = 10;

    // If GO terms are provided, sample from them
    let selectedTerms = [];
    if (goTerms && goTerms.length > 0) {
        // Shuffle and pick 'count' terms
        const shuffled = [...goTerms].sort(() => Math.random() - 0.5);
        selectedTerms = shuffled.slice(0, Math.min(count, shuffled.length));
    }

    for (let i = 0; i < count; i++) {
        // Random grid-aligned coordinates
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
            foldChange = 0.75 - Math.random() * 0.5;
            pValue = Math.random() * 0.049;
        } else if (rand < 0.8) {
            // Yellow: Neutral/Other (p < 0.05, but FC between 0.75 and 1.25)
            foldChange = 0.76 + Math.random() * 0.48;
            pValue = Math.random() * 0.049;
        } else {
            // Black: Insignificant (p >= 0.05)
            foldChange = Math.random() * 4;
            pValue = 0.05 + Math.random() * 0.5;
        }

        // Use GO term ID if available, otherwise fallback to entity-{i}
        const id = selectedTerms[i]?.ID || `entity-${i}`;

        entities.push({
            id,
            x,
            y,
            foldChange,
            pValue,
        });
    }

    // Generate relationships between random pairs
    for (let i = 0; i < count - 1; i++) {
        if (Math.random() > 0.6) { // Slightly more relationships
            relationships.push({
                source: entities[i].id,
                target: entities[i + 1].id,
                type: 'interaction',
            });
        }
    }

    return { entities, relationships };
};

