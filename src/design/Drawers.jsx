import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { loadLibraryIndex } from '../utils/offlinePipeline.js';

// ────────────────────────────────────────────────────────────────────────
// LeftDrawer — slides in from the left when the hamburger is tapped.
// Hosts: Custom gene input (wired to onRunAnalysis), Filters, GO-term table.
// ────────────────────────────────────────────────────────────────────────
export function LeftDrawer({
    open, onClose,
    // Analysis wiring
    onRunAnalysis, isLoading,
    // Filters wiring — reads from `parameters`, writes via onParametersChange
    parameters, onParametersChange,
    // Term list (derived entities)
    visibleTerms, selectedId, onSelectTerm,
    // Quick actions
    onShowImport,
    // Display-only
    showEdges, showLabels, onToggleEdges, onToggleLabels,
}) {
    const [tab, setTab] = useState('custom');
    const [exportOpen, setExportOpen] = useState(false);

    useEffect(() => {
        if (!exportOpen) return;
        const h = () => setExportOpen(false);
        const t = setTimeout(() => document.addEventListener('click', h, { once: true }), 0);
        return () => { clearTimeout(t); document.removeEventListener('click', h); };
    }, [exportOpen]);

    return (
        <>
            <div className={'drawer-scrim ' + (open ? 'on' : '')} onClick={onClose} />
            <aside className={'drawer ' + (open ? 'open' : '')} onClick={(e) => e.stopPropagation()}>
                <div className="drawer-head">
                    <div className="brand">
                        <div className="logo"><i /><i /><i /><i /></div>
                        <div>
                            Mondrian Map
                            <div><small>multi-resolution GO enrichment</small></div>
                        </div>
                    </div>
                    <div className="grow" />
                    <button className="close-btn" onClick={onClose} title="Close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="6" y1="6" x2="18" y2="18" />
                            <line x1="6" y1="18" x2="18" y2="6" />
                        </svg>
                    </button>
                </div>

                <div className="quick-actions">
                    <button className="qa" onClick={onShowImport}>
                        <Icon name="upload" />
                        <span>Import</span>
                    </button>
                    <div className="menu-wrap" style={{ position: 'relative' }}>
                        <button className="qa" onClick={(e) => { e.stopPropagation(); setExportOpen(o => !o); }}>
                            <Icon name="download" />
                            <span>Export</span>
                        </button>
                        {exportOpen && <ExportMenu />}
                    </div>
                    <button className="qa primary" disabled title="Use the Run button below">
                        <Icon name="play" />
                        <span>Run</span>
                    </button>
                </div>

                <div className="drawer-body">
                    <div className="section">
                        <div className="tabs">
                            <button className={tab === 'custom' ? 'on' : ''} onClick={() => setTab('custom')}>Gene Set</button>
                            <button className={tab === 'case' ? 'on' : ''} onClick={() => setTab('case')}>Case Studies</button>
                            <button className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>Upload</button>
                        </div>
                        {tab === 'custom' && (
                            <CustomInputPanel onRunAnalysis={onRunAnalysis} isLoading={isLoading} />
                        )}
                        {tab === 'case' && <CaseStudyPlaceholder />}
                        {tab === 'upload' && <UploadPlaceholder />}
                    </div>

                    <FiltersSection
                        parameters={parameters}
                        onParametersChange={onParametersChange}
                        showEdges={showEdges}
                        showLabels={showLabels}
                        onToggleEdges={onToggleEdges}
                        onToggleLabels={onToggleLabels}
                    />

                    <TermsTable
                        visibleTerms={visibleTerms}
                        selectedId={selectedId}
                        onSelect={(id) => { onSelectTerm(id); onClose(); }}
                    />
                </div>
            </aside>
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────
// CustomInputPanel — up/down textareas + library + Run. Wires to onRunAnalysis.
// ────────────────────────────────────────────────────────────────────────
function CustomInputPanel({ onRunAnalysis, isLoading }) {
    const DEFAULT_UP = 'ATP6V0B, BANF1, BSG, BST2, BZW1, C14orf2, C19orf43, CALM1, CALM3, CALR, CAP1, CCND3, CCT3';
    const DEFAULT_DOWN = 'CCT6A, CCT7, CCT8, CD53, CD63, CFL1, CKB, CKS1B, CLIC1, CMTM6, CNN2';

    const [up, setUp] = useState(DEFAULT_UP);
    const [down, setDown] = useState(DEFAULT_DOWN);
    const [caseName, setCaseName] = useState('Custom Analysis');
    const [libraryIndex, setLibraryIndex] = useState(null);
    const [library, setLibrary] = useState('GO_Biological_Process_2023');

    useEffect(() => {
        loadLibraryIndex().then(setLibraryIndex).catch(() => {});
    }, []);

    const parseGenes = (t) => t.split(/[\s,;\t\n]+/)
        .map(g => g.trim().toUpperCase())
        .filter(g => g.length > 0 && /^[A-Z0-9\-_.]+$/.test(g));

    const upGenes = parseGenes(up);
    const downGenes = parseGenes(down);
    const canRun = (upGenes.length + downGenes.length) >= 5 && !isLoading;

    const run = () => {
        if (!canRun) return;
        onRunAnalysis({
            up_genes: upGenes,
            down_genes: downGenes,
            case_study: caseName.trim() || 'Custom Analysis',
            contrast: '',
            library,
        });
    };

    return (
        <>
            <div className="field">
                <label>Upregulated genes <span className="meta">· {upGenes.length} genes</span></label>
                <textarea value={up} onChange={e => setUp(e.target.value)} />
            </div>
            <div className="field">
                <label>Downregulated genes <span className="meta">· {downGenes.length} genes</span></label>
                <textarea value={down} onChange={e => setDown(e.target.value)} />
            </div>
            <div className="field">
                <label>Case name</label>
                <input type="text" value={caseName} onChange={e => setCaseName(e.target.value)} />
            </div>
            <div className="field">
                <label>Enrichment library</label>
                <select value={library} onChange={e => setLibrary(e.target.value)}>
                    {libraryIndex ? libraryIndex.map(l => (
                        <option key={l.id} value={l.id}>
                            {l.display_name} · {l.term_count?.toLocaleString?.() ?? l.term_count} terms
                        </option>
                    )) : <option>Loading libraries…</option>}
                </select>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>
                Separate with commas, spaces, or newlines. Requires ≥ 5 genes total.
            </div>
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                onClick={run} disabled={!canRun}>
                {isLoading ? (<><span className="spinner" /> Running enrichment…</>) : 'Run enrichment analysis'}
            </button>
        </>
    );
}

function CaseStudyPlaceholder() {
    return (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, padding: '4px 0' }}>
            Case-study presets (LINCS / GTEx / MoTrPAC) will appear here. For now, use the <strong style={{ color: 'var(--ink)' }}>Gene Set</strong> tab to paste genes directly.
        </div>
    );
}

function UploadPlaceholder() {
    return (
        <div className="drop">
            <strong>Drop scRNA-seq or bulk RNA-seq file</strong>
            <span>.h5ad · .rds · 10x · counts matrix · DESeq2 output</span>
        </div>
    );
}

function FiltersSection({ parameters, onParametersChange, showEdges, showLabels, onToggleEdges, onToggleLabels }) {
    const p = parameters || {};
    const set = (patch) => onParametersChange({ ...p, ...patch });
    return (
        <div className="section">
            <h3>Filters</h3>
            <div className="field">
                <label>Adjusted p-value ≤ <span className="meta">{(p.pValueCutoff ?? 0.05).toFixed(3)}</span></label>
                <div className="slider">
                    <input type="range" min="0.001" max="0.1" step="0.001" value={p.pValueCutoff ?? 0.05}
                        onChange={e => set({ pValueCutoff: parseFloat(e.target.value) })} />
                    <span className="v">{(p.pValueCutoff ?? 0.05).toFixed(3)}</span>
                </div>
            </div>
            <div className="field">
                <label>Min genes per term <span className="meta">{p.minGenes ?? 2}</span></label>
                <div className="slider">
                    <input type="range" min="1" max="20" step="1" value={p.minGenes ?? 2}
                        onChange={e => set({ minGenes: parseInt(e.target.value, 10) })} />
                    <span className="v">{p.minGenes ?? 2}</span>
                </div>
            </div>
            <div className="field">
                <label>Crosstalk Jaccard ≥ <span className="meta">{(p.jaccardThreshold ?? 0.15).toFixed(2)}</span></label>
                <div className="slider">
                    <input type="range" min="0.05" max="0.5" step="0.01" value={p.jaccardThreshold ?? 0.15}
                        onChange={e => set({ jaccardThreshold: parseFloat(e.target.value) })} />
                    <span className="v">{(p.jaccardThreshold ?? 0.15).toFixed(2)}</span>
                </div>
            </div>
            <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span>Crosstalk edges</span>
                    <div className={'toggle ' + (showEdges ? 'on' : '')} onClick={onToggleEdges} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, marginTop: 8 }}>
                    <span>Term labels</span>
                    <div className={'toggle ' + (showLabels ? 'on' : '')} onClick={onToggleLabels} />
                </div>
            </div>
        </div>
    );
}

function TermsTable({ visibleTerms, selectedId, onSelect }) {
    return (
        <div className="section">
            <h3>GO terms at this layer</h3>
            <div style={{ maxHeight: 300, overflow: 'auto', margin: '0 -4px' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Name</th>
                            <th>L</th>
                            <th style={{ textAlign: 'right' }}>−log p</th>
                            <th style={{ textAlign: 'right' }}>n</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleTerms.slice().sort((a, b) => b.logp - a.logp).map(t => (
                            <tr key={t.id}
                                className={t.id === selectedId ? 'on' : ''}
                                onClick={() => onSelect(t.id)}>
                                <td style={{ width: 14 }}>
                                    <span className="chip" style={{
                                        background: t.dir > 0 ? '#d7261e' : t.dir < 0 ? '#1857c4' : '#f3c20a'
                                    }} />
                                </td>
                                <td className="name" title={t.name}>{t.name}</td>
                                <td>{t.layer}</td>
                                <td className="num">{t.logp.toFixed(2)}</td>
                                <td className="num">{t.n}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {visibleTerms.length === 0 && (
                    <div style={{ padding: '16px 8px', color: 'var(--ink-3)', fontSize: 12.5, textAlign: 'center' }}>
                        No terms match the current filters.
                    </div>
                )}
            </div>
        </div>
    );
}

function ExportMenu() {
    return (
        <div className="menu" onClick={(e) => e.stopPropagation()}
            style={{ top: 'calc(100% + 6px)', left: 0, right: 'auto', minWidth: 240 }}>
            <div className="sub">Publication</div>
            <div className="item"><Icon name="slides" /> PowerPoint · titled slides <span className="kb">.pptx</span></div>
            <div className="item"><Icon name="doc" /> Word report · methods + figure <span className="kb">.docx</span></div>
            <div className="item"><Icon name="md" /> Markdown + citation <span className="kb">.md</span></div>
            <hr />
            <div className="sub">Data</div>
            <div className="item"><Icon name="excel" /> Titled Excel workbook <span className="kb">.xlsx</span></div>
            <div className="item"><Icon name="json" /> Enrichment results <span className="kb">.json</span></div>
            <div className="item"><Icon name="csv" /> GO terms table <span className="kb">.csv</span></div>
            <hr />
            <div className="sub">Figure</div>
            <div className="item"><Icon name="img" /> Mondrian map · raster <span className="kb">.png</span></div>
            <div className="item"><Icon name="img" /> Mondrian map · vector <span className="kb">.svg</span></div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// DetailDrawer — right-side panel that opens when a term block is selected.
// ────────────────────────────────────────────────────────────────────────
export function DetailDrawer({ term, onClose }) {
    const [tab, setTab] = useState('ai');
    const open = !!term;

    return (
        <aside className={'detail-drawer ' + (open ? 'open' : '')} onClick={(e) => e.stopPropagation()}>
            {term && (
                <>
                    <div className="detail-head">
                        <div className="color-chip" style={{
                            background: term.dir > 0 ? '#d7261e' : term.dir < 0 ? '#1857c4' : '#f3c20a'
                        }} />
                        <div className="title">
                            <h2>{term.name}</h2>
                            <div className="meta">
                                {term.id} · L{term.layer} · −log₁₀p = {term.logp.toFixed(2)} · n={term.n}
                            </div>
                        </div>
                        <button className="close-btn" onClick={onClose}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="6" y1="6" x2="18" y2="18" />
                                <line x1="6" y1="18" x2="18" y2="6" />
                            </svg>
                        </button>
                    </div>

                    <div className="section" style={{ paddingBottom: 0 }}>
                        <div className="tabs">
                            <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI Insights</button>
                            <button className={tab === 'genes' ? 'on' : ''} onClick={() => setTab('genes')}>Genes</button>
                            <button className={tab === 'similar' ? 'on' : ''} onClick={() => setTab('similar')}>Similar</button>
                        </div>
                    </div>

                    <div className="detail-body">
                        {tab === 'ai' && <AIInsightPanel term={term} />}
                        {tab === 'genes' && <GenesPanel term={term} />}
                        {tab === 'similar' && <SimilarPanel term={term} />}
                    </div>
                </>
            )}
        </aside>
    );
}

function AIInsightPanel({ term }) {
    const dirText = term.dir > 0 ? 'upregulated' : term.dir < 0 ? 'downregulated' : 'bidirectional';
    const hubs = (term.genes || []).slice(0, 4);
    return (
        <div className="section">
            <div className="ai-card">
                <h4>Biological narrative</h4>
                <p>At GOALS layer {term.layer} ({term.layer <= 5 ? 'fine resolution' : term.layer <= 9 ? 'mid resolution' : 'umbrella'}), this term appears <strong>{dirText}</strong>{hubs.length ? ' with hub genes ' : ''}
                    {hubs.map((g, i) => (
                        <React.Fragment key={g}>
                            <span className="hub">{g}</span>
                            {i < hubs.length - 1 ? ' ' : ''}
                        </React.Fragment>
                    ))}
                    . The signature emerges at this specificity and rearranges into broader programs at higher layers.</p>
            </div>
            <div className="ai-card">
                <h4>Next steps</h4>
                <ul>
                    <li>Zoom out to L{Math.min(13, term.layer + 5)} to see whether this signal integrates into an umbrella program.</li>
                    <li>Zoom in to L{Math.max(1, term.layer - 2)} to reveal the specific molecular events driving it.</li>
                    <li>Cross-reference hub genes against perturbation signatures in LINCS.</li>
                </ul>
            </div>
            <div className="ai-card" style={{ background: '#fff' }}>
                <em className="muted">AI-generated narratives require the existing AIExplainPanel wiring to be re-connected. Selection is live; full narrative generation will land next.</em>
            </div>
        </div>
    );
}

function GenesPanel({ term }) {
    return (
        <div className="section">
            <dl className="result-meta">
                <dt>GO ID</dt><dd>{term.id}</dd>
                <dt>Layer</dt><dd>L{term.layer}</dd>
                <dt>Direction</dt><dd>{term.dir > 0 ? '↑ up' : term.dir < 0 ? '↓ down' : '± shared'}</dd>
                <dt>−log₁₀p</dt><dd>{term.logp.toFixed(3)}</dd>
                <dt>n genes</dt><dd>{term.n}</dd>
            </dl>
            <h3 style={{ marginTop: 14 }}>Hub genes ({(term.genes || []).length})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {(term.genes || []).map(g => (<span key={g} className="chip-pill">{g}</span>))}
            </div>
            <h3 style={{ marginTop: 14 }}>Related resources</h3>
            <div className="similarity-list">
                <div className="row">
                    <div>
                        <div style={{ fontSize: 12.5 }}>AmiGO 2 — {term.id}</div>
                        <div className="src">amigo.geneontology.org</div>
                    </div>
                    <div />
                    <a className="btn" style={{ padding: '2px 8px', textDecoration: 'none' }}
                        href={`https://amigo.geneontology.org/amigo/term/${encodeURIComponent(term.id)}`}
                        target="_blank" rel="noreferrer">↗</a>
                </div>
                <div className="row">
                    <div>
                        <div style={{ fontSize: 12.5 }}>QuickGO — ancestors & descendants</div>
                        <div className="src">ebi.ac.uk/QuickGO</div>
                    </div>
                    <div />
                    <a className="btn" style={{ padding: '2px 8px', textDecoration: 'none' }}
                        href={`https://www.ebi.ac.uk/QuickGO/term/${encodeURIComponent(term.id)}`}
                        target="_blank" rel="noreferrer">↗</a>
                </div>
            </div>
        </div>
    );
}

function SimilarPanel({ term }) {
    return (
        <div className="section">
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>
                Cross-reference this term against CFDE rummageGEO / rummaGENE indexes. Not yet wired.
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                Selected: <span className="hub">{term.id}</span> · {(term.genes || []).length} hub genes
            </div>
        </div>
    );
}
