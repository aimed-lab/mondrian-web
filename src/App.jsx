import React, { useState, useEffect } from 'react';
import MondrianMap from './components/MondrianMap';
import DataUploader from './components/DataUploader';
import { generateSyntheticData } from './utils/syntheticData';
import { RefreshCw } from 'lucide-react';

function App() {
    const [data, setData] = useState({ entities: [], relationships: [] });
    const [isSynthetic, setIsSynthetic] = useState(true);

    useEffect(() => {
        // Load synthetic data by default
        const { entities, relationships } = generateSyntheticData();
        setData({ entities, relationships });
    }, []);

    const handleDataLoaded = (uploadedData) => {
        // Map uploaded data fields to expected format if needed
        // Assuming CSV has headers: ID, wFC, pFDR, x, y
        // We map: ID -> id, wFC -> foldChange, pFDR -> pValue, x -> x, y -> y, (area calculated or default)

        const mappedEntities = uploadedData.entities.map(e => ({
            id: String(e.ID || e.id),
            x: e.x,
            y: e.y,
            area: e.area || Math.random() * 0.8 + 0.2, // Default if missing
            foldChange: e.wFC || e.foldChange || 0,
            pValue: e.pFDR || e.pValue || 1
        }));

        const mappedRelationships = uploadedData.relationships.map(r => ({
            source: String(r.ID1 || r.source),
            target: String(r.ID2 || r.target),
            type: 'unknown' // Logic to determine type based on nodes can be added
        }));

        setData({ entities: mappedEntities, relationships: mappedRelationships });
        setIsSynthetic(false);
    };

    const regenerateSynthetic = () => {
        const { entities, relationships } = generateSyntheticData();
        setData({ entities, relationships });
        setIsSynthetic(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 font-sans">
            <h1 className="text-4xl font-bold mb-2 text-black tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                Mondrian Map
            </h1>
            <p className="text-gray-500 mb-8">Bioinformatics Visualization Tool</p>

            <DataUploader onDataLoaded={handleDataLoaded} />

            <div className="flex gap-4 mb-4">
                <button
                    onClick={regenerateSynthetic}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors"
                >
                    <RefreshCw size={16} />
                    Regenerate Synthetic Data
                </button>
            </div>

            <MondrianMap
                entities={data.entities}
                relationships={data.relationships}
                width={800}
                height={600}
            />

            <div className="mt-8 text-xs text-gray-400">
                {isSynthetic ? "Viewing Synthetic Data" : "Viewing Uploaded Data"}
            </div>
        </div>
    );
}

export default App;
