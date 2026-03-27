import React, { useState, useCallback } from 'react';
import { Play, ChevronDown, ChevronUp } from 'lucide-react';

const parseGenes = (text) =>
    text
        .split(/[\s,;\t\n]+/)
        .map(g => g.trim().toUpperCase())
        .filter(g => g.length > 0 && /^[A-Z0-9\-_.]+$/.test(g));

const GeneSetInput = ({ onRunAnalysis, isLoading }) => {
    const [upText,    setUpText]    = useState('');
    const [downText,  setDownText]  = useState('');
    const [caseName,  setCaseName]  = useState('');
    const [contrast,  setContrast]  = useState('');
    const [isOpen,    setIsOpen]    = useState(true);
    const [showMeta,  setShowMeta]  = useState(false);

    const upGenes   = parseGenes(upText);
    const downGenes = parseGenes(downText);
    const totalGenes = new Set([...upGenes, ...downGenes]).size;
    const canRun = (upGenes.length >= 5 || downGenes.length >= 5) && !isLoading;

    const handleRun = useCallback(() => {
        if (!canRun) return;
        onRunAnalysis({
            up_genes:   upGenes,
            down_genes: downGenes,
            case_study: caseName.trim() || 'Custom Analysis',
            contrast:   contrast.trim(),
        });
    }, [upGenes, downGenes, caseName, contrast, canRun, onRunAnalysis]);

    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleRun();
    };

    const labelCls    = 'block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5';
    const textareaCls = 'w-full text-sm font-mono bg-gray-50 border border-gray-200 focus:outline-none focus:border-black p-2.5 resize-none transition-colors placeholder-gray-400 leading-relaxed';
    const inputCls    = 'w-full text-sm bg-gray-50 border border-gray-200 focus:outline-none focus:border-black px-3 py-2 transition-colors';

    return (
        <div className="bg-white p-5 shadow-lg border-2 border-black w-full rounded-none">
            {/* Header — no icon */}
            <div
                className="flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-5 -my-5 p-5"
                onClick={() => setIsOpen(o => !o)}
            >
                <h2 className="text-base font-bold text-black tracking-wide">Gene Set Input</h2>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>

            {isOpen && (
                <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col gap-4">

                    {/* Upregulated genes */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className={labelCls}>Upregulated Genes</label>
                            {upGenes.length > 0 && (
                                <span className="text-xs font-medium text-gray-500">{upGenes.length} genes</span>
                            )}
                        </div>
                        <textarea
                            className={textareaCls}
                            rows={4}
                            placeholder={"TP53, BRCA1, EGFR\nMYC KRAS CDK4\nPTEN MDM2"}
                            value={upText}
                            onChange={e => setUpText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                        />
                    </div>

                    {/* Downregulated genes */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className={labelCls}>Downregulated Genes</label>
                            {downGenes.length > 0 && (
                                <span className="text-xs font-medium text-gray-500">{downGenes.length} genes</span>
                            )}
                        </div>
                        <textarea
                            className={textareaCls}
                            rows={4}
                            placeholder={"RB1, CDKN2A, TP53BP1\nAPC SMAD4"}
                            value={downText}
                            onChange={e => setDownText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                        />
                    </div>

                    {/* Optional metadata toggle */}
                    <button
                        onClick={() => setShowMeta(m => !m)}
                        className="text-xs text-gray-500 hover:text-black text-left transition-colors flex items-center gap-1.5 font-medium"
                    >
                        {showMeta ? '▾' : '▸'} Optional: case study details
                    </button>

                    {showMeta && (
                        <div className="flex flex-col gap-3 pl-3 border-l-2 border-gray-200">
                            <div>
                                <label className={labelCls}>Case Study Name</label>
                                <input type="text" className={inputCls} placeholder="e.g. LINCS_Afatinib" value={caseName} onChange={e => setCaseName(e.target.value)} disabled={isLoading} />
                            </div>
                            <div>
                                <label className={labelCls}>Contrast</label>
                                <input type="text" className={inputCls} placeholder="e.g. Drug vs Control" value={contrast} onChange={e => setContrast(e.target.value)} disabled={isLoading} />
                            </div>
                        </div>
                    )}

                    {/* Hint */}
                    <p className="text-xs text-gray-500 leading-relaxed">
                        Separate genes with commas, spaces, or newlines. Requires ≥5 genes in at least one list.{' '}
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Ctrl+Enter</kbd> to run.
                    </p>

                    {/* Run button */}
                    <button
                        onClick={handleRun}
                        disabled={!canRun}
                        className="w-full bg-black text-white py-3 px-4 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold transition-colors rounded-none text-sm tracking-wider uppercase"
                    >
                        <Play size={14} />
                        {isLoading
                            ? 'Running...'
                            : `Run Enrichment Analysis${totalGenes > 0 ? ` (${totalGenes} genes)` : ''}`}
                    </button>
                </div>
            )}
        </div>
    );
};

export default GeneSetInput;
