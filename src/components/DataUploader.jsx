import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';

const DataUploader = ({ onDataLoaded }) => {
    const [entitiesFile, setEntitiesFile] = useState(null);
    const [relationshipsFile, setRelationshipsFile] = useState(null);

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        if (type === 'entities') setEntitiesFile(file);
        else setRelationshipsFile(file);
    };

    const processFiles = () => {
        if (!entitiesFile) return;

        Papa.parse(entitiesFile, {
            header: true,
            dynamicTyping: true,
            complete: (results) => {
                const entities = results.data.filter(row => row.ID || row.id);

                if (relationshipsFile) {
                    Papa.parse(relationshipsFile, {
                        header: true,
                        dynamicTyping: true,
                        complete: (relResults) => {
                            const relationships = relResults.data;
                            onDataLoaded({ entities, relationships });
                        }
                    });
                } else {
                    onDataLoaded({ entities, relationships: [] });
                }
            }
        });
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Upload Data</h2>
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Entities CSV</label>
                    <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileChange(e, 'entities')}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Relationships CSV</label>
                    <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileChange(e, 'relationships')}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                </div>
            </div>
            <button
                onClick={processFiles}
                disabled={!entitiesFile}
                className="w-full bg-black text-white py-2 px-4 rounded hover:bg-gray-800 disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
                <Upload size={18} />
                Visualize
            </button>
        </div>
    );
};

export default DataUploader;
