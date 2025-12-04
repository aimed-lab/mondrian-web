import React from 'react';
import { Download } from 'lucide-react';

const DataTable = ({ entities, relationships }) => {
    const formatFloat = (val) => {
        if (typeof val === 'number') return val.toFixed(2);
        return val;
    };

    const downloadSampleData = () => {
        // Sample Entities CSV
        const entitiesCsv = `ID,wFC,pFDR,x,y
entity-1,1.5,0.01,100,100
entity-2,-0.8,0.02,300,200
entity-3,0.1,0.001,500,500
entity-4,2.0,0.04,700,300
entity-5,0.5,0.1,200,600`;

        // Sample Relationships CSV
        const relationshipsCsv = `ID1,ID2
entity-1,entity-2
entity-3,entity-4`;

        const downloadBlob = (content, filename) => {
            const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        };

        downloadBlob(entitiesCsv, 'sample_entities.csv');
        setTimeout(() => downloadBlob(relationshipsCsv, 'sample_relationships.csv'), 500);
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-md h-[1000px] overflow-y-auto">
            {/* Entities Table */}
            <div className="bg-white p-4 shadow-lg border-2 border-black">
                <h3 className="text-lg font-bold mb-2 border-b-2 border-black pb-1">Entities</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-gray-100">
                            <tr>
                                <th className="px-2 py-1 border">ID</th>
                                <th className="px-2 py-1 border">FC</th>
                                <th className="px-2 py-1 border">p-val</th>
                                <th className="px-2 py-1 border">X</th>
                                <th className="px-2 py-1 border">Y</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entities.map((e) => (
                                <tr key={e.id} className="border-b hover:bg-gray-50">
                                    <td className="px-2 py-1 border font-mono">{e.id.split('-')[1] || e.id}</td>
                                    <td className="px-2 py-1 border">{formatFloat(e.foldChange)}</td>
                                    <td className="px-2 py-1 border">{formatFloat(e.pValue)}</td>
                                    <td className="px-2 py-1 border">{Math.round(e.x)}</td>
                                    <td className="px-2 py-1 border">{Math.round(e.y)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Relationships Table */}
            <div className="bg-white p-4 shadow-lg border-2 border-black">
                <h3 className="text-lg font-bold mb-2 border-b-2 border-black pb-1">Relationships</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-gray-100">
                            <tr>
                                <th className="px-2 py-1 border">Source</th>
                                <th className="px-2 py-1 border">Target</th>
                            </tr>
                        </thead>
                        <tbody>
                            {relationships.map((r, i) => (
                                <tr key={i} className="border-b hover:bg-gray-50">
                                    <td className="px-2 py-1 border font-mono">{r.source.split('-')[1] || r.source}</td>
                                    <td className="px-2 py-1 border font-mono">{r.target.split('-')[1] || r.target}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-4">
                <button
                    onClick={downloadSampleData}
                    className="w-full bg-black text-white py-2 px-4 rounded hover:bg-gray-800 flex items-center justify-center gap-2 font-bold"
                >
                    <Download size={18} />
                    Download Sample CSVs
                </button>
            </div>
        </div>
    );
};

export default DataTable;
