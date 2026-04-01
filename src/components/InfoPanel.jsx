import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import sparcLogo from '../assets/sparc_logo.png';

const InfoPanel = () => {
    const [isLegendOpen, setIsLegendOpen] = useState(false);
    const [isReferenceOpen, setIsReferenceOpen] = useState(false);

    const panelCls = 'bg-white p-5 shadow-lg border-2 border-black w-full rounded-none';
    const headerCls = 'flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-5 -my-5 p-5';
    const titleCls = 'text-base font-bold text-black tracking-wide';

    return (
        <div className="flex flex-col gap-6 w-full mt-6">
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
                                    ['#FFD700', 'Shared'],
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
                        <div className="space-y-6">
                            <div>
                                <p className="mb-2">
                                    Al Abir, Fuad, and Jake Y. Chen. "Mondrian Abstraction and Language Model Embeddings for Differential Pathway Analysis." In <em>2024 IEEE International Conference on Bioinformatics and Biomedicine (BIBM)</em>, pp. 407–410. IEEE, 2024.
                                </p>
                                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                                    <a href="https://ieeexplore.ieee.org/document/10822686" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors uppercase text-[10px] font-bold tracking-wider">IEEE Xplore</a>
                                    <a href="https://doi.org/10.1101/2024.04.11.589093" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors uppercase text-[10px] font-bold tracking-wider">DOI</a>
                                    <a href="https://pubmed.ncbi.nlm.nih.gov/38659966/" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors uppercase text-[10px] font-bold tracking-wider">PMID</a>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-50">
                                <p className="mb-2">
                                    Yue, Z., Welner, R. S., Willey, C. D., Amin, R., Li, Q., Chen, H., and Chen, J. Y. "GOALS: Gene Ontology Analysis with Layered Shells for Enhanced Functional Insight and Visualization." <em>bioRxiv</em> (2025).
                                </p>
                                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                                    <a href="https://doi.org/10.1101/2025.04.22.650095" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black hover:underline transition-colors uppercase text-[10px] font-bold tracking-wider">DOI</a>
                                </div>
                            </div>
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

export default InfoPanel;
