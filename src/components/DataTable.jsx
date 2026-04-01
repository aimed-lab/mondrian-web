import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { parseLINCSId } from '../utils/parseLINCSId.js';
import { getLayerSuffix } from '../utils/layerSuffix.js';

// ---------------------------------------------------------------------------
// ExperimentSummary — renders metadata in a structured, human-readable way.
// Tries to parse LINCS identifiers; falls back to raw strings for other data.
// ---------------------------------------------------------------------------

function MetaRow({ label, value }) {
    if (!value && value !== 0) return null;
    return (
        <div className="flex gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0 w-24 pt-0.5">{label}</span>
            <span className="text-xs text-gray-800 break-words min-w-0">{value}</span>
        </div>
    );
}

function ExperimentSummary({ meta, nodeCount, edgeCount, currentLayer }) {
    const layerDisplay = currentLayer === null ? 'All' : `Layer ${currentLayer}`;
    // Attempt LINCS parsing from the contrast string (most detailed) then case_study
    const parsed = parseLINCSId(meta.contrast) || parseLINCSId(meta.case_study);

    const upCount = meta.up_gene_count ?? 0;
    const downCount = meta.down_gene_count ?? 0;

    if (parsed) {
        const { cellLine, drugDisplay, concentration, durationDisplay, well, plate } = parsed;
        // Build library label: strip common prefixes for readability
        const lib = (meta.library || '')
            .replace(/_\d{4}$/, '')          // drop year suffix
            .replace(/_/g, ' ');

        return (
            <div className="space-y-2">
                {/* Condition hero */}
                <div className="bg-gray-50 border border-gray-200 px-3 py-2.5">
                    <p className="text-xs font-bold text-gray-900 leading-snug">
                        {cellLine} · {drugDisplay}
                        {concentration && <span className="font-normal text-gray-600"> ({concentration})</span>}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">vs. Vehicle Control</p>
                </div>

                {/* Detail rows */}
                <div className="space-y-1.5 pt-1">
                    <MetaRow label="Cell Line" value={cellLine} />
                    <MetaRow label="Drug" value={`${drugDisplay}${concentration ? ` — ${concentration}` : ''}`} />
                    <MetaRow label="Duration" value={durationDisplay !== 'treatment' ? durationDisplay : 'Unspecified'} />
                    <MetaRow label="Plate / Well" value={`${plate}  ·  ${well}`} />
                    {lib && <MetaRow label="Library" value={lib} />}
                    <MetaRow label="Gene Input" value={`${upCount} up · ${downCount} down`} />
                    <MetaRow label="GO Terms" value={nodeCount} />
                    <MetaRow label="Crosstalks" value={edgeCount} />
                    <MetaRow label="Selected Layer" value={layerDisplay} />
                </div>
            </div>
        );
    }

    // Fallback for non-LINCS datasets
    return (
        <div className="space-y-1.5">
            {meta.case_study && <MetaRow label="Case" value={meta.case_study} />}
            {meta.contrast && <MetaRow label="Contrast" value={meta.contrast} />}
            <MetaRow label="Genes" value={`${upCount} upregulated · ${downCount} downregulated`} />
            <MetaRow label="GO Terms" value={nodeCount} />
            <MetaRow label="Crosstalks" value={edgeCount} />
            <MetaRow label="Selected Layer" value={layerDisplay} />
        </div>
    );
}

// ---------------------------------------------------------------------------

const DataTable = ({ layoutJson, filteredNodes, filteredEdges, onSelectionToggle, selection, currentLayer, aiSection }) => {
    const [isResultsOpen, setIsResultsOpen] = useState(true);

    // Use filtered nodes/edges if provided, fallback to layoutJson
    const nodes = filteredNodes ?? layoutJson?.nodes ?? [];
    const edges = filteredEdges ?? layoutJson?.edges ?? [];
    const meta = layoutJson?.metadata ?? null;

    const layerSuffix = currentLayer === null ? ' (All)' : ` (L${currentLayer})`;

    const fmtP = (val) => {
        if (val === undefined || val === null) return '—';
        if (val < 1e-4) return val.toExponential(2);
        return val.toFixed(4);
    };
    const fmtSig = (val) => (typeof val === 'number' ? val.toFixed(2) : '—');

    const dirColor = {
        upregulated: '#E30022',
        downregulated: '#0078BF',
        shared: '#FFD700',
    };

    const handleDownloadResults = useCallback(() => {
        if (!meta || !nodes) return;

        const isFiltered = filteredNodes !== undefined;
        let content = "ENRICHMENT ANALYSIS RESULTS" + (isFiltered ? ` — ${currentLayer === null ? 'All Layers' : `Layer ${currentLayer}`}` : "") + "\n";
        content += "===========================\n\n";
        content += "METADATA\n";
        content += `Case Study: ${meta.case_study || 'N/A'}\n`;
        content += `Contrast: ${meta.contrast || 'N/A'}\n`;
        content += `Library: ${meta.library || 'N/A'}\n`;
        content += `Up Genes: ${meta.up_gene_count || 0}\n`;
        content += `Down Genes: ${meta.down_gene_count || 0}\n`;
        content += `GO Terms: ${nodes.length}\n`;
        content += `Crosstalks: ${edges.length}\n`;
        content += `Generated at: ${meta.generated_at || new Date().toISOString()}\n\n`;

        content += "GO TERMS\n";
        content += "Direction,GO ID,Term Name,Layer,-log10(p),Adj P-value,Gene Count,Genes\n";
        nodes.forEach(n => {
            const pVal = n.pValue !== undefined ? n.pValue : n.adjusted_p_value;
            const pValStr = (typeof pVal === 'number') ? pVal.toExponential(4) : (pVal || '—');
            const row = [
                n.direction,
                n.go_id.startsWith('GO:') ? n.go_id : `GO:${n.go_id}`,
                `"${n.name.replace(/"/g, '""')}"`,
                n.layer || 0,
                n.significance_score.toFixed(4),
                pValStr,
                n.gene_count,
                `"${(n.genes || []).join(', ')}"`
            ];
            content += row.join(',') + "\n";
        });

        if (edges.length > 0) {
            content += "\nCROSSTALKS\n";
            content += "Source,Target,Jaccard\n";
            edges.forEach(e => {
                const source = e.source.startsWith('GO:') ? e.source : `GO:${e.source}`;
                const target = e.target.startsWith('GO:') ? e.target : `GO:${e.target}`;
                content += `${source},${target},${e.weight.toFixed(4)}\n`;
            });
        }

        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const suffix = getLayerSuffix(currentLayer);
        link.setAttribute("download", `enrichment_results_${(meta.case_study || 'analysis').replace(/\s+/g, '_')}${suffix}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [meta, nodes, edges, currentLayer, filteredNodes]);

    const panelCls = 'bg-white p-5 shadow-lg border-2 border-black w-full rounded-none';
    const headerCls = 'flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-5 -my-5 p-5';
    const titleCls = 'text-base font-bold text-black tracking-wide';
    const subheadCls = 'text-xs font-bold uppercase px-3 py-2 border-b border-gray-200 bg-gray-50 tracking-wider text-gray-600';
    const thCls = 'px-3 py-1.5 text-xs text-gray-600 font-bold';
    const tdCls = 'px-3 py-1.5 text-sm';

    return (
        <div className="flex flex-col gap-6 w-full">

            {/* ENRICHMENT RESULTS */}
            {nodes.length > 0 && (
                <div className={panelCls}>
                    <div className={headerCls} onClick={() => setIsResultsOpen(o => !o)}>
                        <h2 className={titleCls}>Enrichment Results</h2>
                        {isResultsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>

                    {isResultsOpen && (
                        <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">

                            {/* Metadata summary */}
                            {meta && (
                                <ExperimentSummary
                                    meta={meta}
                                    nodeCount={nodes.length}
                                    edgeCount={edges.length}
                                    currentLayer={currentLayer}
                                />
                            )}

                            {/* GO Terms table */}
                            <div className="border border-gray-200 overflow-hidden">
                                <h3 className={subheadCls}>GO Terms</h3>
                                <div className="overflow-y-auto max-h-52">
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 bg-white border-b border-gray-100">
                                            <tr>
                                                <th className={thCls}>Dir</th>
                                                <th className={thCls}>Name</th>
                                                <th className={thCls}>Layer</th>
                                                <th className={thCls}>−log₁₀p</th>
                                                <th className={thCls}>Genes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...nodes]
                                                .sort((a, b) => b.significance_score - a.significance_score)
                                                .map(n => {
                                                    const isSelected = selection?.nodes?.has(`GO:${n.go_id}`);
                                                    return (
                                                        <tr
                                                            key={n.go_id}
                                                            className={`border-b border-gray-50 hover:bg-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                                                            onClick={(e) => onSelectionToggle?.('node', `GO:${n.go_id}`, e.ctrlKey || e.metaKey)}
                                                        >
                                                            <td className={tdCls}>
                                                                <span
                                                                    className="inline-block w-2.5 h-2.5 border border-gray-300"
                                                                    style={{ background: dirColor[n.direction] ?? '#1D1D1D' }}
                                                                />
                                                            </td>
                                                            <td className={`${tdCls} max-w-[150px] truncate font-mono text-gray-700`} title={n.name}>
                                                                {n.name}
                                                            </td>
                                                            <td className={`${tdCls} text-gray-500 font-mono`}>{n.layer || 0}</td>
                                                            <td className={`${tdCls} text-gray-600 font-mono`}>{fmtSig(n.significance_score)}</td>
                                                            <td className={`${tdCls} text-gray-500 font-mono text-right`}>{n.gene_count}</td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Crosstalks table */}
                            {edges.length > 0 && (
                                <div className="border border-gray-200 overflow-hidden">
                                    <h3 className={subheadCls}>Crosstalks</h3>
                                    <div className="overflow-y-auto max-h-36">
                                        <table className="w-full text-left">
                                            <thead className="sticky top-0 bg-white border-b border-gray-100">
                                                <tr>
                                                    <th className={thCls}>Source</th>
                                                    <th className={thCls}>Target</th>
                                                    <th className={thCls}>Jaccard</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...edges]
                                                    .sort((a, b) => b.weight - a.weight)
                                                    .map((e, i) => {
                                                        const sourceId = e.source.startsWith('GO:') ? e.source : `GO:${e.source}`;
                                                        const targetId = e.target.startsWith('GO:') ? e.target : `GO:${e.target}`;
                                                        const edgeId = `${sourceId}-${targetId}`;
                                                        const isSelected = selection?.edges?.has(edgeId);
                                                        return (
                                                            <tr
                                                                key={i}
                                                                className={`border-b border-gray-50 hover:bg-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                                                                onClick={(ev) => onSelectionToggle?.('edge', edgeId, ev.ctrlKey || ev.metaKey)}
                                                            >
                                                                <td className={`${tdCls} font-mono text-gray-600 truncate max-w-[100px]`}>{e.source}</td>
                                                                <td className={`${tdCls} font-mono text-gray-600 truncate max-w-[100px]`}>{e.target}</td>
                                                                <td className={`${tdCls} text-gray-500 font-mono text-right`}>{e.weight?.toFixed(3)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Download Button */}
                            <button
                                onClick={handleDownloadResults}
                                className="mt-2 w-full bg-black text-white py-3 px-4 hover:bg-gray-800 flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-colors rounded-none text-sm"
                                title={`Download results for ${currentLayer === null ? 'all layers' : `layer ${currentLayer}`} as CSV`}
                            >
                                <Download size={14} />
                                Download Enrichment Results
                            </button>
                        </div>
                    )}
                </div>
            )}

            {aiSection && (
                <div className="w-full mt-2">
                    {aiSection}
                </div>
            )}
        </div>
    );
};

export default DataTable;
