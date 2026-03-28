import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, ChevronDown, ChevronUp } from 'lucide-react';

const DataUploader = ({ onDataLoaded }) => {
    const [entitiesFile, setEntitiesFile] = useState(null);
    const [relationshipsFile, setRelationshipsFile] = useState(null);
    const [isOpen, setIsOpen] = useState(true);

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
        <div className="bg-white p-4 shadow-lg border-2 border-black w-full rounded-none">
            <div
                className="flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-4 -my-4 p-4"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h2 className="text-sm font-bold text-black tracking-wider">Upload Data</h2>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {isOpen && (
                <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex flex-col gap-3 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Entities Table</label>
                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer bg-black text-white py-1 px-3 hover:bg-gray-800 text-xs font-bold whitespace-nowrap rounded-none">
                                    Choose CSV File
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
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Relationships Table</label>
                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer bg-black text-white py-1 px-3 hover:bg-gray-800 text-xs font-bold whitespace-nowrap rounded-none">
                                    Choose CSV File
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
                        className="w-full bg-black text-white py-2 px-4 hover:bg-gray-800 disabled:bg-gray-300 flex items-center justify-center gap-2 font-bold rounded-none uppercase text-xs"
                    >
                        <Upload size={14} />
                        Visualize
                    </button>
                </div>
            )}
        </div>
    );
};

export default DataUploader;
