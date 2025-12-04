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
        <div className="bg-white p-6 rounded-lg shadow-md w-full border-2 border-black">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Upload Data</h2>
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Entities CSV</label>
                    <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-black text-white py-2 px-4 rounded hover:bg-gray-800 text-sm font-bold whitespace-nowrap">
                            Choose File
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileChange(e, 'entities')}
                                className="hidden"
                            />
                        </label>
                        <span className="text-xs text-gray-500 truncate">
                            {entitiesFile ? entitiesFile.name : "No file chosen"}
                        </span>
                    </div>
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Relationships CSV</label>
                    <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-black text-white py-2 px-4 rounded hover:bg-gray-800 text-sm font-bold whitespace-nowrap">
                            Choose File
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileChange(e, 'relationships')}
                                className="hidden"
                            />
                        </label>
                        <span className="text-xs text-gray-500 truncate">
                            {relationshipsFile ? relationshipsFile.name : "No file chosen"}
                        </span>
                    </div>
                </div>
            </div>
            <button
                onClick={processFiles}
                disabled={!entitiesFile}
                className="w-full bg-black text-white py-2 px-4 rounded hover:bg-gray-800 disabled:bg-gray-300 flex items-center justify-center gap-2 font-bold"
            >
                <Upload size={18} />
                Visualize
            </button>
        </div>
    );
};

export default DataUploader;
