import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import sparcLogo from '../assets/sparc_logo.png';
import { parseLINCSId } from '../utils/parseLINCSId.js';

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

function ExperimentSummary({ meta, nodeCount, edgeCount }) {
    // Attempt LINCS parsing from the contrast string (most detailed) then case_study
    const parsed = parseLINCSId(meta.contrast) || parseLINCSId(meta.case_study);

    const upCount   = meta.up_gene_count   ?? 0;
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
                    <p className="text-[10px] text-gray-500 mt-0.5">vs. Control</p>
                </div>

                {/* Detail rows */}
                <div className="space-y-1.5 pt-1">
                    <MetaRow label="Cell Line"    value={cellLine} />
                    <MetaRow label="Drug"         value={`${drugDisplay}${concentration ? ` — ${concentration}` : ''}`} />
                    <MetaRow label="Duration"     value={durationDisplay !== 'treatment' ? durationDisplay : 'Unspecified'} />
                    <MetaRow label="Plate / Well" value={`${plate}  ·  ${well}`} />
                    {lib && <MetaRow label="Library" value={lib} />}
                    <MetaRow label="Gene Input"   value={`${upCount} up · ${downCount} down`} />
                    <MetaRow label="GO Terms"     value={`${nodeCount}  ·  Crosstalks: ${edgeCount}`} />
                </div>
            </div>
        );
    }

    // Fallback for non-LINCS datasets
    return (
        <div className="space-y-1.5">
            {meta.case_study && <MetaRow label="Case"     value={meta.case_study} />}
            {meta.contrast   && <MetaRow label="Contrast" value={meta.contrast}   />}
            <MetaRow label="Genes"    value={`${upCount} upregulated · ${downCount} downregulated`} />
            <MetaRow label="GO Terms" value={`${nodeCount}  ·  Crosstalks: ${edgeCount}`} />
        </div>
    );
}

// ---------------------------------------------------------------------------

const DataTable = ({ layoutJson }) => {
    const [isResultsOpen,   setIsResultsOpen]   = useState(true);
    const [isLegendOpen,    setIsLegendOpen]     = useState(false);
    const [isReferenceOpen, setIsReferenceOpen]  = useState(false);

    const nodes = layoutJson?.nodes ?? [];
    const edges = layoutJson?.edges ?? [];
    const meta  = layoutJson?.metadata ?? null;

    const fmtP   = (val) => {
        if (val === undefined || val === null) return '—';
        if (val < 1e-4) return val.toExponential(2);
        return val.toFixed(4);
    };
    const fmtSig = (val) => (typeof val === 'number' ? val.toFixed(2) : '—');

    const dirColor = {
        upregulated:   '#E30022',
        downregulated: '#0078BF',
        shared:        '#FFD700',
    };

    const panelCls   = 'bg-white p-5 shadow-lg border-2 border-black w-full rounded-none';
    const headerCls  = 'flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-5 -my-5 p-5';
    const titleCls   = 'text-base font-bold text-black tracking-wide';
    const subheadCls = 'text-xs font-bold uppercase px-3 py-2 border-b border-gray-200 bg-gray-50 tracking-wider text-gray-600';
    const thCls      = 'px-3 py-1.5 text-xs text-gray-600 font-bold';
    const tdCls      = 'px-3 py-1.5 text-sm';

    return (
        <div className="flex flex-col gap-6 w-full -mt-6">

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
                                                <th className={thCls}>−log₁₀p</th>
                                                <th className={thCls}>Genes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...nodes]
                                                .sort((a, b) => b.significance_score - a.significance_score)
                                                .map(n => (
                                                    <tr key={n.go_id} className="border-b border-gray-50 hover:bg-gray-50">
                                                        <td className={tdCls}>
                                                            <span
                                                                className="inline-block w-2.5 h-2.5 border border-gray-300"
                                                                style={{ background: dirColor[n.direction] ?? '#1D1D1D' }}
                                                            />
                                                        </td>
                                                        <td className={`${tdCls} max-w-[150px] truncate font-mono text-gray-700`} title={n.name}>
                                                            {n.name}
                                                        </td>
                                                        <td className={`${tdCls} text-gray-600`}>{fmtSig(n.significance_score)}</td>
                                                        <td className={`${tdCls} text-gray-500`}>{n.gene_count}</td>
                                                    </tr>
                                                ))}
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
                                                    .map((e, i) => (
                                                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                                            <td className={`${tdCls} font-mono text-gray-600 truncate max-w-[100px]`}>{e.source}</td>
                                                            <td className={`${tdCls} font-mono text-gray-600 truncate max-w-[100px]`}>{e.target}</td>
                                                            <td className={`${tdCls} text-gray-500`}>{e.weight?.toFixed(3)}</td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* DESCRIPTION */}
            <div className={panelCls}>
                <div className={headerCls} onClick={() => setIsLegendOpen(o => !o)}>
                    <h2 className={titleCls}>Description</h2>
                    {isLegendOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
                {isLegendOpen && (
                    <>
                        <div className="mt-5 pt-5 border-t border-gray-100 flex gap-10 w-full animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex flex-col gap-2 text-sm text-gray-700">
                                {[
                                    ['#E30022', 'Upregulated'],
                                    ['#0078BF', 'Downregulated'],
                                    ['#FFD700', 'Shared (intersection)'],
                                ].map(([color, label]) => (
                                    <div key={color} className="flex items-center gap-2">
                                        <span className="w-3 h-3 inline-block border border-black shrink-0" style={{ background: color }} />
                                        <span>{label}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-2 text-sm text-gray-700">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border border-black flex items-center justify-center text-xs font-bold shrink-0">A</div>
                                    <span>Area ∝ −log₁₀(p)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-0 border-t-2 border-black shrink-0" />
                                    <span>Edges: Jaccard ≥ threshold</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 leading-relaxed">
                            <span className="font-semibold text-gray-800">GO Layer:</span> Discretized semantic-granularity level — lower layers contain specific, low-coverage terms; higher layers represent broad umbrella terms including ontology roots.
                        </div>
                    </>
                )}
            </div>

            {/* REFERENCE */}
            <div className={panelCls}>
                <div className={headerCls} onClick={() => setIsReferenceOpen(o => !o)}>
                    <h2 className={titleCls}>Reference</h2>
                    {isReferenceOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
                {isReferenceOpen && (
                    <div className="mt-5 pt-5 border-t border-gray-100 text-sm text-gray-600 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        <p className="mb-3">
                            Al Abir, Fuad, and Jake Y. Chen. "Mondrian Abstraction and Language Model Embeddings for Differential Pathway Analysis." In <em>2024 IEEE International Conference on Bioinformatics and Biomedicine (BIBM)</em>, pp. 407–410. IEEE, 2024.
                        </p>
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                            <a href="https://ieeexplore.ieee.org/document/10822686" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors">IEEE Xplore</a>
                            <a href="https://doi.org/10.1101/2024.04.11.589093" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors">DOI</a>
                            <a href="https://pubmed.ncbi.nlm.nih.gov/38659966/" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors">PMID: 38659966</a>
                        </div>
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div className="mt-auto pt-5 pb-2 flex flex-col items-center justify-center gap-4 border-t border-gray-200 text-center">
                <div className="text-xs text-gray-500 space-y-1">
                    <p>Free and open to all users. No login required. No cookies.</p>
                    <p>Licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">CC BY 4.0</a></p>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-[0.3em]">Powered by</span>
                    <a href="https://www.smartdrugdiscovery.org/" target="_blank" rel="noopener noreferrer">
                        <img src={sparcLogo} alt="SPARC Logo" className="w-16 h-auto opacity-80 hover:opacity-100 transition-opacity" />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default DataTable;
