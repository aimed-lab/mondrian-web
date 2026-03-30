import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Play, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { loadLibraryIndex } from '../utils/offlinePipeline.js';

const parseGenes = (text) =>
    text
        .split(/[\s,;\t\n]+/)
        .map(g => g.trim().toUpperCase())
        .filter(g => g.length > 0 && /^[A-Z0-9\-_.]+$/.test(g));

/** Group libraries by ontology for the dropdown. */
function groupLibraries(index) {
    const groups = {};
    for (const lib of index) {
        const key = lib.ontology || 'Other';
        if (!groups[key]) groups[key] = [];
        groups[key].push(lib);
    }
    for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => (b.year || 0) - (a.year || 0));
    }
    return groups;
}

// ── Shared styles ────────────────────────────────────────────────────────

const labelCls = 'block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5';
const selectCls = 'w-full text-sm bg-gray-50 border border-gray-200 focus:outline-none focus:border-black px-3 py-2 transition-colors cursor-pointer';
const textareaCls = 'w-full text-sm font-mono bg-gray-50 border border-gray-200 focus:outline-none focus:border-black p-2.5 resize-none transition-colors placeholder-gray-400 leading-relaxed';
const inputCls = 'w-full text-sm bg-gray-50 border border-gray-200 focus:outline-none focus:border-black px-3 py-2 transition-colors';
const tabActive = 'px-4 py-2 text-sm font-bold border-b-2 border-black text-black transition-colors';
const tabInactive = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-600 transition-colors cursor-pointer';


// ── Library Selector (shared between both modes) ─────────────────────────

function LibrarySelector({ libraryIndex, selectedLibrary, onChange, disabled }) {
    const groupedLibs = libraryIndex ? groupLibraries(libraryIndex) : null;
    const selectedMeta = libraryIndex?.find(l => l.id === selectedLibrary);

    return (
        <div>
            <label className={labelCls}>Enrichment Library</label>
            <select
                className={selectCls}
                value={selectedLibrary}
                onChange={e => onChange(e.target.value)}
                disabled={disabled || !libraryIndex}
            >
                {!libraryIndex ? (
                    <option>Loading libraries...</option>
                ) : groupedLibs ? (
                    Object.entries(groupedLibs).map(([group, libs]) => (
                        <optgroup key={group} label={group}>
                            {libs.map(lib => (
                                <option key={lib.id} value={lib.id}>
                                    {lib.display_name} ({lib.term_count.toLocaleString()} terms)
                                </option>
                            ))}
                        </optgroup>
                    ))
                ) : null}
            </select>
            {selectedMeta && (
                <p className="text-xs text-gray-400 mt-1">
                    {selectedMeta.term_count.toLocaleString()} terms · {selectedMeta.gene_count.toLocaleString()} genes
                </p>
            )}
        </div>
    );
}


// ── Case Study Panel ─────────────────────────────────────────────────────

function CaseStudyPanel({ libraryIndex, selectedLibrary, onLibraryChange, onRunAnalysis, isLoading }) {
    const [dbIndex, setDbIndex] = useState(null);
    const [dbMeta, setDbMeta] = useState(null);      // selected database metadata (drug list)
    const [selectedDb, setSelectedDb] = useState('');
    const [selectedDrug, setSelectedDrug] = useState('');
    const [drugSearch, setDrugSearch] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [genesLoading, setGenesLoading] = useState(false);
    const [drugGenes, setDrugGenes] = useState(null); // { up: [...], dn: [...] } for selected drug
    const dropdownRef = useRef(null);
    const searchRef = useRef(null);

    // Load database index on mount
    useEffect(() => {
        fetch('/data/databases/index.json')
            .then(r => r.ok ? r.json() : null)
            .then(idx => {
                if (idx && idx.length > 0) {
                    setDbIndex(idx);
                    setSelectedDb(idx[0].id);
                }
            })
            .catch(() => { });
    }, []);

    // Load database metadata (drug list) when database changes
    useEffect(() => {
        if (!dbIndex || !selectedDb) return;
        const entry = dbIndex.find(d => d.id === selectedDb);
        if (!entry) return;

        setDbMeta(null);
        setDrugGenes(null);
        setSelectedDrug('');
        setDrugSearch('');
        shardDataCache.current = {};  // clear shard cache on DB switch

        fetch(`/data/databases/${selectedDb}/meta.json`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) setDbMeta(data);
            })
            .catch(() => { });
    }, [dbIndex, selectedDb]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtered drug list for search
    const filteredDrugs = useMemo(() => {
        if (!dbMeta?.drugs) return [];
        if (!drugSearch.trim()) return dbMeta.drugs;
        const q = drugSearch.trim().toLowerCase();
        return dbMeta.drugs.filter(d => d.name.toLowerCase().includes(q));
    }, [dbMeta, drugSearch]);

    // In-memory caches for shard index and loaded shards (avoids re-fetching)
    const shardIndexCache = useRef({});  // { dbId: { drugName: shardFile } }
    const shardDataCache = useRef({});   // { "dbId/shardFile": { drugName: {up, dn} } }

    // Load gene data for a specific drug from sharded files
    const loadDrugGenes = useCallback(async (drugName) => {
        if (!selectedDb || !drugName) return;

        setGenesLoading(true);
        setDrugGenes(null);

        try {
            // Load shard index (cached after first fetch per database)
            let shardIndex = shardIndexCache.current[selectedDb];
            if (!shardIndex) {
                const res = await fetch(`/data/databases/${selectedDb}/shard_index.json`);
                if (res.ok) {
                    shardIndex = await res.json();
                    shardIndexCache.current[selectedDb] = shardIndex;
                }
            }

            if (shardIndex) {
                const shardFile = shardIndex[drugName];
                if (!shardFile) { setGenesLoading(false); return; }

                // Load shard data (cached after first fetch per shard)
                const cacheKey = `${selectedDb}/${shardFile}`;
                let shardData = shardDataCache.current[cacheKey];
                if (!shardData) {
                    const geneRes = await fetch(`/data/databases/${selectedDb}/${shardFile}`);
                    if (!geneRes.ok) { setGenesLoading(false); return; }
                    shardData = await geneRes.json();
                    shardDataCache.current[cacheKey] = shardData;
                }

                setDrugGenes(shardData[drugName] || null);
            }
        } catch {
            // silent fail
        } finally {
            setGenesLoading(false);
        }
    }, [selectedDb]);

    const currentDbEntry = dbIndex?.find(d => d.id === selectedDb);
    const canVisualize = !!selectedDrug && !!drugGenes && !!selectedLibrary && !isLoading;

    const handleDrugSelect = useCallback((drugName) => {
        setSelectedDrug(drugName);
        setDrugSearch(drugName);
        setDropdownOpen(false);
        loadDrugGenes(drugName);
    }, [loadDrugGenes]);

    const handleSearchChange = useCallback((e) => {
        const val = e.target.value;
        setDrugSearch(val);
        setDropdownOpen(true);
        // Clear selection if user edits the search after selecting
        if (selectedDrug && val !== selectedDrug) {
            setSelectedDrug('');
            setDrugGenes(null);
        }
    }, [selectedDrug]);

    const handleSearchFocus = useCallback(() => {
        if (dbMeta) setDropdownOpen(true);
    }, [dbMeta]);

    const handleSearchKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            setDropdownOpen(false);
            searchRef.current?.blur();
        }
        if (e.key === 'Enter' && filteredDrugs.length === 1) {
            handleDrugSelect(filteredDrugs[0].name);
        }
    }, [filteredDrugs, handleDrugSelect]);

    const handleVisualize = useCallback(() => {
        if (!canVisualize) return;

        // Specific control descriptions based on dataset
        const isGTExAging = selectedDb === 'GTEx_Aging_Signatures_2021';
        const isMoTrPAC = selectedDb === 'MoTrPAC_Endurance_Trained_Rats_2023';
        const isLINCS = selectedDb.startsWith('LINCS_L1000');

        let contrastSuffix = '';
        if (isMoTrPAC) contrastSuffix = ' vs Sedentary Control';
        else if (isLINCS) contrastSuffix = ' vs Vehicle Control';
        else if (!isGTExAging) contrastSuffix = ' vs Control';

        onRunAnalysis({
            up_genes: drugGenes.up || [],
            down_genes: drugGenes.dn || [],
            case_study: `${selectedDb}_${selectedDrug}`,
            contrast: `${selectedDrug}${contrastSuffix}`,
            library: selectedLibrary,
        });
    }, [canVisualize, drugGenes, selectedDb, selectedDrug, selectedLibrary, onRunAnalysis]);

    return (
        <div className="flex flex-col gap-4">
            {/* 1. Database */}
            <div>
                <label className={labelCls}>Database</label>
                <select
                    className={selectCls}
                    value={selectedDb}
                    onChange={e => setSelectedDb(e.target.value)}
                    disabled={isLoading || !dbIndex}
                >
                    {!dbIndex ? (
                        <option>Loading databases...</option>
                    ) : (
                        dbIndex.map(db => (
                            <option key={db.id} value={db.id}>
                                {db.name} ({db.drug_count.toLocaleString()} {db.label_type || 'entries'})
                            </option>
                        ))
                    )}
                </select>
            </div>

            {/* 2. Drug/Condition — searchable dropdown */}
            <div ref={dropdownRef} className="relative">
                <label className={labelCls}>
                    {currentDbEntry?.label_type || 'Condition'}
                </label>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        ref={searchRef}
                        type="text"
                        className={`${inputCls} pl-8`}
                        placeholder={`Search ${dbMeta?.drugs?.length?.toLocaleString() || ''} ${(currentDbEntry?.label_type || 'entries').toLowerCase()}...`}
                        value={drugSearch}
                        onChange={handleSearchChange}
                        onFocus={handleSearchFocus}
                        onKeyDown={handleSearchKeyDown}
                        disabled={isLoading || !dbMeta}
                        autoComplete="off"
                    />
                </div>

                {/* Dropdown list */}
                {dropdownOpen && dbMeta && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 shadow-lg">
                        {filteredDrugs.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
                        ) : (
                            <>
                                {drugSearch.trim() && (
                                    <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 bg-gray-50 sticky top-0">
                                        {filteredDrugs.length.toLocaleString()} of {dbMeta.drugs.length.toLocaleString()} matches
                                    </div>
                                )}
                                {filteredDrugs.slice(0, 200).map(d => (
                                    <button
                                        key={d.name}
                                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex justify-between items-center ${d.name === selectedDrug ? 'bg-gray-100 font-medium' : ''
                                            }`}
                                        onClick={() => handleDrugSelect(d.name)}
                                    >
                                        <span className="truncate">{d.name}</span>
                                        <span className="text-xs text-gray-400 ml-2 shrink-0">{d.up}↑ {d.dn}↓</span>
                                    </button>
                                ))}
                                {filteredDrugs.length > 200 && (
                                    <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                                        Type to narrow results ({(filteredDrugs.length - 200).toLocaleString()} more)
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Gene preview */}
            {selectedDrug && (
                <div className="bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
                    {genesLoading ? (
                        <span className="text-gray-400">Loading gene lists...</span>
                    ) : drugGenes ? (
                        <>
                            <div className="mb-1">
                                <span className="font-bold text-gray-700">Upregulated:</span>{' '}
                                {drugGenes.up?.length || 0} genes
                            </div>
                            <div>
                                <span className="font-bold text-gray-700">Downregulated:</span>{' '}
                                {drugGenes.dn?.length || 0} genes
                            </div>
                        </>
                    ) : (
                        <span className="text-gray-400">Select a {(currentDbEntry?.label_type || 'condition').toLowerCase()} to preview genes</span>
                    )}
                </div>
            )}

            {/* 3. Library */}
            <LibrarySelector
                libraryIndex={libraryIndex}
                selectedLibrary={selectedLibrary}
                onChange={onLibraryChange}
                disabled={isLoading}
            />

            {/* Visualize button */}
            <button
                onClick={handleVisualize}
                disabled={!canVisualize}
                className="w-full bg-black text-white py-3 px-4 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold transition-colors rounded-none text-sm tracking-wider uppercase"
            >
                <Play size={14} />
                {isLoading ? 'Running...' : 'Visualize'}
            </button>
        </div>
    );
}


// ── Custom Input Panel ───────────────────────────────────────────────────

function CustomInputPanel({ libraryIndex, selectedLibrary, onLibraryChange, onRunAnalysis, isLoading }) {
    const [upText, setUpText] = useState('');
    const [downText, setDownText] = useState('');
    const [caseName, setCaseName] = useState('');
    const [contrast, setContrast] = useState('');
    const [showMeta, setShowMeta] = useState(false);

    const upGenes = parseGenes(upText);
    const downGenes = parseGenes(downText);
    const totalGenes = new Set([...upGenes, ...downGenes]).size;
    const canRun = (upGenes.length >= 5 || downGenes.length >= 5) && !isLoading;

    const handleRun = useCallback(() => {
        if (!canRun) return;
        onRunAnalysis({
            up_genes: upGenes,
            down_genes: downGenes,
            case_study: caseName.trim() || 'Custom Analysis',
            contrast: contrast.trim(),
            library: selectedLibrary,
        });
    }, [upGenes, downGenes, caseName, contrast, canRun, onRunAnalysis, selectedLibrary]);

    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleRun();
    };

    return (
        <div className="flex flex-col gap-4">
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

            {/* Library */}
            <LibrarySelector
                libraryIndex={libraryIndex}
                selectedLibrary={selectedLibrary}
                onChange={onLibraryChange}
                disabled={isLoading}
            />

            {/* Optional metadata */}
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
    );
}


// ── Main Component ───────────────────────────────────────────────────────

const GeneSetInput = ({ onRunAnalysis, isLoading }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [mode, setMode] = useState('custom'); // 'custom' | 'case_study'
    const [libraryIndex, setLibraryIndex] = useState(null);
    const [selectedLibrary, setSelectedLibrary] = useState('GO_Biological_Process_2023');

    useEffect(() => {
        loadLibraryIndex().then(index => {
            if (index) setLibraryIndex(index);
        });
    }, []);

    return (
        <div className="bg-white p-5 shadow-lg border-2 border-black w-full rounded-none">
            {/* Header */}
            <div
                className="flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors -mx-5 -my-5 p-5"
                onClick={() => setIsOpen(o => !o)}
            >
                <h2 className="text-base font-bold text-black tracking-wide">Gene Set</h2>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>

            {isOpen && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                    {/* Mode tabs */}
                    <div className="flex border-b border-gray-200 mb-5 -mx-5 px-5">
                        <button
                            className={mode === 'custom' ? tabActive : tabInactive}
                            onClick={() => setMode('custom')}
                        >
                            Custom Input
                        </button>
                        <button
                            className={mode === 'case_study' ? tabActive : tabInactive}
                            onClick={() => setMode('case_study')}
                        >
                            Case Studies
                        </button>
                    </div>

                    {mode === 'custom' ? (
                        <CustomInputPanel
                            libraryIndex={libraryIndex}
                            selectedLibrary={selectedLibrary}
                            onLibraryChange={setSelectedLibrary}
                            onRunAnalysis={onRunAnalysis}
                            isLoading={isLoading}
                        />
                    ) : (
                        <CaseStudyPanel
                            libraryIndex={libraryIndex}
                            selectedLibrary={selectedLibrary}
                            onLibraryChange={setSelectedLibrary}
                            onRunAnalysis={onRunAnalysis}
                            isLoading={isLoading}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default GeneSetInput;
