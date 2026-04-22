/* global React */

// ============================================================================
// SearchPill — top-left, Google-Maps collapsed search pill
// Hamburger + case chip + search icon. Everything else lives INSIDE the drawer.
// ============================================================================
function SearchPill({ state, setState }) {
  return (
    <div className="search-pill" onClick={(e) => e.stopPropagation()}>
      <button className="menu-btn"
              onClick={() => setState(s => ({...s, drawerOpen: true}))}
              title="Open menu (M)">
        <span className="bars"><i/><i/><i/></span>
      </button>
      <div className="case-chip"
           onClick={() => setState(s => ({...s, drawerOpen: true}))}>
        <div className="title">{state.caseLabel}</div>
        <div className="sub">
          {state.upN}↑ {state.downN}↓ · {state.visibleCount} GO · {state.layer === "all" ? "L1–13" : "L" + state.layer}
        </div>
      </div>
      <button className="search-icon" title="Search terms"
              onClick={() => setState(s => ({...s, drawerOpen: true}))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.5" y2="16.5"/>
        </svg>
      </button>
    </div>
  );
}

// ============================================================================
// TopRightCluster — just the user avatar (export/import/run moved to drawer)
// ============================================================================
function TopRightCluster({ state, setState }) {
  return (
    <div className="topright">
      {state.user ? (
        <button className="fab round" title="Account">
          <span className="avatar">FA</span>
        </button>
      ) : (
        <button className="fab round" title="Sign in (optional)"
                onClick={() => setState(s => ({...s, showLogin: true}))}>
          <Icon name="user" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MapControls — bottom-right: layer button (popup), compass, zoom stack
// ============================================================================
function MapControls({ state, setState, onZoomIn, onZoomOut, onReset, layerCounts }) {
  const [layersOpen, setLayersOpen] = React.useState(false);
  const availableLayers = Object.keys(layerCounts)
    .map(Number).filter(L => layerCounts[L].total > 0);

  // close popup on outside click
  React.useEffect(() => {
    if (!layersOpen) return;
    const h = () => setLayersOpen(false);
    setTimeout(() => document.addEventListener("click", h, { once: true }), 0);
    return () => document.removeEventListener("click", h);
  }, [layersOpen]);

  const currentLayer = state.layer === "all" ? null : state.layer;
  const layerHint = currentLayer == null ? "All" : "L" + currentLayer;

  return (
    <div className="br-cluster" onClick={(e) => e.stopPropagation()}>
      {/* Layer button */}
      <div style={{position:"relative"}}>
        <button className={"map-btn" + (layersOpen ? " on" : "")}
                title="Goals layer"
                onClick={(e) => { e.stopPropagation(); setLayersOpen(o => !o); }}>
          <LayerIcon/>
          <span className="badge">{layerHint}</span>
        </button>
        {layersOpen && (
          <LayerPopup
            state={state} setState={setState}
            layerCounts={layerCounts}
            availableLayers={availableLayers}
            onChange={(L) => {
              setState(s => ({...s, layer: L === null ? "all" : L, selected: null}));
            }}
          />
        )}
      </div>

      {/* Compass / fit button */}
      <button className="map-btn" title="Fit to view (0)" onClick={onReset}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M12 4 L14 12 L12 20 L10 12 Z" fill="#d7261e" stroke="#111" strokeWidth="0.6"/>
        </svg>
      </button>

      {/* Zoom */}
      <div className="zoom-stack">
        <button onClick={onZoomIn} title="Zoom in (+)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button onClick={onZoomOut} title="Zoom out (−)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function LayerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 3 22 9 12 15 2 9 12 3"/>
      <polyline points="2 15 12 21 22 15"/>
    </svg>
  );
}

// ============================================================================
// LayerPopup — the GOALS pyramid, now hosted in a compact popup
// ============================================================================
function LayerPopup({ state, setState, layerCounts, availableLayers, onChange }) {
  const allLayers = 13;
  const availSet = new Set(availableLayers);
  const isAllMode = state.layer === "all";
  const currentLayer = isAllMode ? null : state.layer;

  const layerHints = {
    1: "molecular", 2: "reaction", 3: "complex", 4: "pathway step",
    5: "pathway", 6: "organelle", 7: "defense", 8: "cellular",
    9: "tissue", 10: "multi-cellular", 11: "regulatory", 12: "system", 13: "umbrella",
  };

  const W = 180, H = 120;
  const slices = [];
  for (let L = allLayers; L >= 1; L--) {
    const idx = allLayers - L;
    const sliceH = (H / allLayers);
    const gap = 1.5;
    const yTop = idx * sliceH;
    const yBottom = (idx + 1) * sliceH - gap;
    const topRatio = idx / allLayers;
    const botRatio = (idx + 1) / allLayers;
    const wTop = 12 + (W - 12) * topRatio;
    const wBottom = 12 + (W - 12) * botRatio;
    const xTopLeft = (W - wTop) / 2;
    const xTopRight = W - xTopLeft;
    const xBotLeft = (W - wBottom) / 2;
    const xBotRight = W - xBotLeft;
    const path = `M ${xTopLeft} ${yTop} L ${xTopRight} ${yTop} L ${xBotRight} ${yBottom} L ${xBotLeft} ${yBottom} Z`;
    const avail = availSet.has(L);
    const active = isAllMode ? avail : (currentLayer === L);
    const hover = availSet.has(L);
    const fill = active ? "#111" : avail ? "#d6d3c9" : "#efece3";
    const count = layerCounts[L]?.total || 0;
    slices.push(
      <g key={L}>
        <path d={path} fill={fill}
              stroke={active ? "#111" : "transparent"}
              strokeWidth="0.6"
              style={{cursor: avail ? "pointer" : "not-allowed", transition: "fill .15s"}}
              onClick={() => avail && onChange(L)}>
          <title>Layer {L} — {layerHints[L]} · {count} terms</title>
        </path>
        {/* layer tick label on right */}
        <text x={W + 4} y={yTop + sliceH/2 + 3} fontSize="8" fill={active ? "#111" : "#8a8a92"}
              fontFamily="var(--mono)" fontWeight={active ? 700 : 400}>
          L{L}
        </text>
      </g>
    );
  }

  return (
    <div className="layer-popup" onClick={(e) => e.stopPropagation()}>
      <h4>GOALS Layer</h4>
      <div className="current">
        {isAllMode ? "All 13" : `L${currentLayer}`}
        <span className="kind">
          {isAllMode ? "overview" : layerHints[currentLayer]}
        </span>
      </div>
      <div className="pyramid-wrap">
        <svg width={W + 28} height={H + 4} viewBox={`0 0 ${W + 28} ${H + 4}`}>
          {slices}
        </svg>
      </div>
      <button className={"show-all " + (isAllMode ? "on" : "")}
              onClick={() => onChange(isAllMode ? availableLayers[availableLayers.length - 1] : null)}>
        {isAllMode ? "Focus a layer →" : "Show all 13 layers"}
      </button>
    </div>
  );
}

// ============================================================================
// MapLegend — bottom-left: tiny button that opens a popup legend
// ============================================================================
function MapLegend({ state }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    setTimeout(() => document.addEventListener("click", h, { once: true }), 0);
    return () => document.removeEventListener("click", h);
  }, [open]);

  return (
    <div className="bl-cluster" onClick={(e) => e.stopPropagation()}>
      <div style={{position:"relative"}}>
        <button className={"map-btn" + (open ? " on" : "")}
                title="Legend"
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
        {open && (
          <div className="legend-popup" onClick={(e) => e.stopPropagation()}>
            <h4>Blocks</h4>
            <div className="row"><span className="sw" style={{background:"#E63946"}}/> Upregulated pathway</div>
            <div className="row"><span className="sw" style={{background:"#1D4ED8"}}/> Downregulated pathway</div>
            <div className="row"><span className="sw" style={{background:"#FFC928"}}/> Neutral / shared</div>
            <div className="divider"/>
            <h4>Crosstalk edges</h4>
            <div className="row"><span className="ln" style={{background:"#E63946"}}/> Up ↔ up</div>
            <div className="row"><span className="ln" style={{background:"#1D4ED8"}}/> Down ↔ down</div>
            <div className="row"><span className="ln" style={{background:"#E8A82B"}}/> Mixed / neutral</div>
            <div className="note">
              Block size ∝ −log₁₀p · Edge width ∝ Jaccard · Position = {state.embedding.replace("_", "·")}
            </div>
          </div>
        )}
      </div>
      <div className="scale-bar">
        <span>0</span>
        <span className="bar"><i/><i/><i/><i/></span>
        <span>−log₁₀p</span>
      </div>
      <div className="attribution">© MONDRIAN MAP · {state.embedding.split("_")[0].toUpperCase()}</div>
    </div>
  );
}

// ============================================================================
// LeftDrawer — the full menu (opens from the hamburger).
// Now hosts Import / Export / Run as "Quick Actions" at the top.
// ============================================================================
function LeftDrawer({ state, setState, visibleTerms, layerCounts }) {
  const datasets = window.MM_DATASETS;
  const libs = window.MM_LIBRARIES;
  const ds = datasets.find(d => d.id === state.datasetId);
  const [mode, setMode] = React.useState("case");
  const [exportOpen, setExportOpen] = React.useState(false);

  React.useEffect(() => {
    if (!exportOpen) return;
    const h = () => setExportOpen(false);
    setTimeout(() => document.addEventListener("click", h, { once: true }), 0);
    return () => document.removeEventListener("click", h);
  }, [exportOpen]);

  return (
    <>
      <div className={"drawer-scrim " + (state.drawerOpen ? "on" : "")}
           onClick={() => setState(s => ({...s, drawerOpen: false}))}/>
      <aside className={"drawer " + (state.drawerOpen ? "open" : "")}
             onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="brand">
            <div className="logo"><i/><i/><i/><i/></div>
            <div>
              Mondrian Map
              <div><small>multi-resolution GO enrichment</small></div>
            </div>
          </div>
          <div className="grow"/>
          <button className="close-btn" onClick={() => setState(s => ({...s, drawerOpen: false}))}
                  title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>
            </svg>
          </button>
        </div>

        {/* Quick actions: Import / Export / Run */}
        <div className="quick-actions">
          <button className="qa" onClick={() => setState(s => ({...s, showImport: true, drawerOpen: false}))}>
            <Icon name="upload" />
            <span>Import</span>
          </button>
          <div className="menu-wrap" style={{position:"relative"}}>
            <button className="qa" onClick={(e) => { e.stopPropagation(); setExportOpen(o => !o); }}>
              <Icon name="download" />
              <span>Export</span>
            </button>
            {exportOpen && <ExportMenu onClose={() => setExportOpen(false)}/>}
          </div>
          <button className="qa primary">
            <Icon name="play" />
            <span>Run</span>
          </button>
        </div>

        <div className="drawer-body">
          {/* Source */}
          <div className="section">
            <div className="tabs">
              <button className={mode === "case" ? "on" : ""} onClick={() => setMode("case")}>Case Studies</button>
              <button className={mode === "upload" ? "on" : ""} onClick={() => setMode("upload")}>Upload</button>
              <button className={mode === "custom" ? "on" : ""} onClick={() => setMode("custom")}>Gene Set</button>
            </div>

            {mode === "case" && (
              <>
                {datasets.map(d => (
                  <div key={d.id}
                    className={"dataset-card " + (d.id === state.datasetId ? "on" : "")}
                    onClick={() => setState(s => ({ ...s, datasetId: d.id, cohortIds: [d.cohorts[0].id] }))}>
                    <div className="src">{d.source} · {d.format === "scRNA" ? "scRNA-seq" : "bulk"}</div>
                    <div className="title">{d.title}</div>
                    <div className="meta">{d.assay}</div>
                  </div>
                ))}
                <div style={{marginTop:6, fontSize:11.5, color:"var(--ink-3)"}}>
                  <strong style={{color:"var(--ink)", fontWeight:500}}>No login required.</strong> Sign in only to save histories & share links.
                </div>
              </>
            )}

            {mode === "upload" && (
              <div style={{display:"flex", flexDirection:"column", gap:10}}>
                <div className="drop"
                     onClick={() => setState(s => ({ ...s, datasetId: "user_scrna", cohortIds: ["cd4_covid"] }))}>
                  <strong>Drop scRNA-seq file</strong>
                  <span>.h5ad · .rds · 10x · Seurat · CellxGene URL</span>
                </div>
                <div className="drop">
                  <strong>Drop bulk RNA-seq</strong>
                  <span>counts matrix · DESeq2 output · .csv · .tsv</span>
                </div>
                <div className="field">
                  <label>Or pull from GEO / ArrayExpress</label>
                  <input type="text" defaultValue="GSE164073" />
                </div>
                <div className="field">
                  <label>Or CFDE Data Ecosystem</label>
                  <select defaultValue="lincs">
                    <option value="lincs">LINCS L1000</option>
                    <option value="gtex">GTEx</option>
                    <option value="motrpac">MoTrPAC</option>
                    <option value="hubmap">HuBMAP</option>
                    <option value="kids">Kids First</option>
                  </select>
                </div>
                <button className="btn primary" onClick={() => setState(s => ({...s, showImport: true}))}>
                  Continue to mapping →
                </button>
              </div>
            )}

            {mode === "custom" && (
              <div>
                <div className="field">
                  <label>Upregulated genes <span className="meta">· 13 genes</span></label>
                  <textarea defaultValue={window.MM_EXAMPLE.up}></textarea>
                </div>
                <div className="field">
                  <label>Downregulated genes <span className="meta">· 11 genes</span></label>
                  <textarea defaultValue={window.MM_EXAMPLE.down}></textarea>
                </div>
                <div className="field">
                  <label>Enrichment library</label>
                  <select defaultValue="go_bp_2025">
                    {libs.map(l => <option key={l.id} value={l.id}>{l.label} · {l.terms.toLocaleString()} terms</option>)}
                  </select>
                </div>
                <div style={{fontSize:11, color:"var(--ink-3)"}}>
                  Separate with commas, spaces, or newlines. Requires ≥5 genes.
                </div>
              </div>
            )}
          </div>

          {/* Cohorts */}
          {mode !== "custom" && ds && (
            <div className="section">
              <h3>{ds.groupBy}
                <span className="act"
                  onClick={() => setState(s => ({...s, cohortIds: ds.cohorts.map(c => c.id)}))}>select all</span>
              </h3>
              <div className="cohort-list">
                {ds.cohorts.map(c => {
                  const on = state.cohortIds.includes(c.id);
                  const total = c.up + c.down || 1;
                  const uw = Math.max(3, (c.up / total) * 44);
                  const dw = Math.max(3, (c.down / total) * 44);
                  return (
                    <label key={c.id} className={"cohort " + (on ? "on" : "")}>
                      <input type="checkbox" checked={on} onChange={() => {
                        setState(s => ({
                          ...s,
                          cohortIds: on ? s.cohortIds.filter(x => x !== c.id) : [...s.cohortIds, c.id]
                        }));
                      }}/>
                      <div>
                        <div style={{fontSize:12.5}}>{c.label}</div>
                        <div style={{display:"flex", gap:4, alignItems:"center", marginTop:2}}>
                          <span style={{width:uw, height:4, background:"#d7261e", display:"inline-block"}}/>
                          <span style={{width:dw, height:4, background:"#1857c4", display:"inline-block"}}/>
                          <span className="n">{c.total} GO</span>
                        </div>
                      </div>
                      <span className="n">n={c.n.toLocaleString()}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Embedding */}
          <div className="section">
            <h3>GO embedding</h3>
            <div className="field">
              <select value={state.embedding}
                      onChange={e => setState(s => ({...s, embedding: e.target.value}))}>
                {window.MM_EMBEDDINGS.map(e =>
                  <option key={e.id} value={e.id}>{e.label} ({e.dim})</option>
                )}
              </select>
              <div className="meta" style={{marginTop:4}}>
                Precomputed · {window.MM_EMBEDDINGS.find(e=>e.id===state.embedding)?.note}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="section">
            <h3>Filters</h3>
            <div className="field">
              <label>Adjusted p-value ≤ <span className="meta">{state.pThreshold.toFixed(3)}</span></label>
              <div className="slider">
                <input type="range" min="0.001" max="0.1" step="0.001" value={state.pThreshold}
                  onChange={e => setState(s => ({...s, pThreshold: parseFloat(e.target.value)}))}/>
                <span className="v">{state.pThreshold.toFixed(3)}</span>
              </div>
            </div>
            <div className="field">
              <label>Min genes per term <span className="meta">{state.minGenes}</span></label>
              <div className="slider">
                <input type="range" min="1" max="20" step="1" value={state.minGenes}
                  onChange={e => setState(s => ({...s, minGenes: parseInt(e.target.value)}))}/>
                <span className="v">{state.minGenes}</span>
              </div>
            </div>
            <div className="field">
              <label>Crosstalk Jaccard ≥ <span className="meta">{state.jaccard.toFixed(2)}</span></label>
              <div className="slider">
                <input type="range" min="0.05" max="0.5" step="0.01" value={state.jaccard}
                  onChange={e => setState(s => ({...s, jaccard: parseFloat(e.target.value)}))}/>
                <span className="v">{state.jaccard.toFixed(2)}</span>
              </div>
            </div>
            <div className="field">
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:12.5}}>
                <span>Crosstalk edges</span>
                <div className={"toggle " + (state.showEdges ? "on" : "")}
                     onClick={() => setState(s => ({...s, showEdges: !s.showEdges}))}/>
              </div>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:12.5, marginTop:8}}>
                <span>Term labels</span>
                <div className={"toggle " + (state.showLabels ? "on" : "")}
                     onClick={() => setState(s => ({...s, showLabels: !s.showLabels}))}/>
              </div>
            </div>
          </div>

          {/* Results preview */}
          <div className="section">
            <h3>GO terms at this layer <span className="act"
                onClick={() => setState(s => ({...s, selected: null}))}>clear</span></h3>
            <div style={{maxHeight: 260, overflow:"auto", margin:"0 -4px"}}>
              <table className="table">
                <thead>
                  <tr><th></th><th>Name</th><th>L</th>
                      <th style={{textAlign:"right"}}>−log p</th>
                      <th style={{textAlign:"right"}}>n</th></tr>
                </thead>
                <tbody>
                  {visibleTerms.slice().sort((a,b)=>b.logp-a.logp).map(t => (
                    <tr key={t.id}
                        className={t.id === state.selected ? "on" : ""}
                        onClick={() => setState(s => ({...s, selected: t.id, drawerOpen: false}))}>
                      <td style={{width:14}}>
                        <span className="chip" style={{background: t.dir>0?"#d7261e":t.dir<0?"#1857c4":"#f3c20a"}}/>
                      </td>
                      <td className="name" title={t.name}>{t.name}</td>
                      <td>{t.layer}</td>
                      <td className="num">{t.logp.toFixed(2)}</td>
                      <td className="num">{t.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function ExportMenu({ onClose }) {
  return (
    <div className="menu" onClick={(e) => e.stopPropagation()}
         style={{top:"calc(100% + 6px)", left:0, right:"auto", minWidth:240}}>
      <div className="sub">Publication</div>
      <div className="item"><Icon name="slides"/> PowerPoint · titled slides <span className="kb">.pptx</span></div>
      <div className="item"><Icon name="doc"/> Word report · methods + figure <span className="kb">.docx</span></div>
      <div className="item"><Icon name="md"/> Markdown + citation <span className="kb">.md</span></div>
      <hr/>
      <div className="sub">Data</div>
      <div className="item"><Icon name="excel"/> Titled Excel workbook <span className="kb">.xlsx</span></div>
      <div className="item"><Icon name="json"/> Enrichment results <span className="kb">.json</span></div>
      <div className="item"><Icon name="csv"/> GO terms table <span className="kb">.csv</span></div>
      <hr/>
      <div className="sub">Figure</div>
      <div className="item"><Icon name="img"/> Mondrian map · raster <span className="kb">.png</span></div>
      <div className="item"><Icon name="img"/> Mondrian map · vector <span className="kb">.svg</span></div>
    </div>
  );
}

// ============================================================================
// DetailDrawer — right-side: opens when a block is selected
// ============================================================================
function DetailDrawer({ state, setState, visibleTerms }) {
  const term = visibleTerms.find(t => t.id === state.selected);
  const [tab, setTab] = React.useState("ai");
  const isOpen = !!term;

  return (
    <aside className={"detail-drawer " + (isOpen ? "open" : "")}
           onClick={(e) => e.stopPropagation()}>
      {term && (
        <>
          <div className="detail-head">
            <div className="color-chip" style={{
              background: term.dir>0?"#d7261e":term.dir<0?"#1857c4":"#f3c20a"
            }}/>
            <div className="title">
              <h2>{term.name}</h2>
              <div className="meta">{term.id} · L{term.layer} · −log₁₀p = {term.logp.toFixed(2)} · n={term.n}</div>
            </div>
            <button className="close-btn" onClick={() => setState(s => ({...s, selected: null}))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>
              </svg>
            </button>
          </div>

          <div className="section" style={{paddingBottom: 0}}>
            <div className="tabs">
              <button className={tab==="ai"?"on":""} onClick={() => setTab("ai")}>AI Insights</button>
              <button className={tab==="genes"?"on":""} onClick={() => setTab("genes")}>Genes</button>
              <button className={tab==="similar"?"on":""} onClick={() => setTab("similar")}>Similar</button>
            </div>
          </div>

          <div className="detail-body">
            {tab === "ai" && <AIInsight term={term}/>}
            {tab === "genes" && <GenesPanel term={term}/>}
            {tab === "similar" && <SimilarPanel term={term}/>}
          </div>
        </>
      )}
    </aside>
  );
}

function AIInsight({ term }) {
  const dirText = term.dir > 0 ? "upregulated" : term.dir < 0 ? "downregulated" : "bidirectional";
  return (
    <div className="section">
      <div className="ai-card">
        <h4>Biological narrative</h4>
        <p>At GOALS layer {term.layer} ({term.layer <= 5 ? "fine resolution" : term.layer <= 9 ? "mid resolution" : "umbrella"}), this term appears <strong>{dirText}</strong> with hub genes {term.genes.slice(0,4).map((g,i)=>(
          <React.Fragment key={g}><span className="hub">{g}</span>{i<Math.min(3,term.genes.length-1)?" ":""}</React.Fragment>
        ))}. The pattern is consistent with coordinated transcriptional regulation at this specificity level — the signature emerges at this zoom but rearranges into broader programs at higher layers.</p>
      </div>
      <div className="ai-card">
        <h4>Crosstalk interpretation</h4>
        <p>Edges with Jaccard ≥ 0.15 link this term to 2–3 neighbours on the map. Shared members suggest a common regulatory driver — likely an NF-κB / STAT3 axis for immune terms, or an ER-stress axis for folding terms.</p>
      </div>
      <div className="ai-card">
        <h4>Testable hypothesis</h4>
        <ul>
          <li>Zoom out to L{Math.min(13, term.layer + 5)} to see whether this signal integrates into an umbrella program.</li>
          <li>Zoom in to L{Math.max(1, term.layer - 2)} to reveal the specific molecular events driving it.</li>
          <li>Cross-reference hub genes against perturbation signatures in LINCS.</li>
        </ul>
      </div>
      <div className="ai-card" style={{background:"#fff"}}>
        <em className="muted">AI-generated — verify against underlying enrichment data and literature.</em>
      </div>
      <div className="btn-row" style={{marginTop:10}}>
        <button className="btn">Copy as Markdown</button>
        <button className="btn">Add to report</button>
        <button className="btn">Regenerate</button>
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
        <dt>Direction</dt><dd>{term.dir > 0 ? "↑ up" : term.dir < 0 ? "↓ down" : "± shared"}</dd>
        <dt>−log₁₀p</dt><dd>{term.logp.toFixed(3)}</dd>
        <dt>n genes</dt><dd>{term.n}</dd>
      </dl>
      <h3 style={{marginTop:14}}>Hub genes ({term.genes.length})</h3>
      <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:4}}>
        {term.genes.map(g => (
          <span key={g} className="chip-pill">{g}</span>
        ))}
      </div>
      <h3 style={{marginTop:14}}>Related resources</h3>
      <div className="similarity-list">
        <div className="row">
          <div>
            <div style={{fontSize:12.5}}>AmiGO 2 — {term.id}</div>
            <div className="src">amigo.geneontology.org</div>
          </div>
          <div/>
          <button className="btn" style={{padding:"2px 8px"}}>↗</button>
        </div>
        <div className="row">
          <div>
            <div style={{fontSize:12.5}}>QuickGO — ancestors & descendants</div>
            <div className="src">ebi.ac.uk/QuickGO</div>
          </div>
          <div/>
          <button className="btn" style={{padding:"2px 8px"}}>↗</button>
        </div>
      </div>
    </div>
  );
}

function SimilarPanel({ term }) {
  const rummageGEO = [
    { id: "GSE147507", src: "rummageGEO · GEO", title: "COVID-19 lung autopsy vs healthy", score: 0.82 },
    { id: "GSE107011", src: "rummageGEO · GEO", title: "Neutrophil activation · sepsis", score: 0.74 },
    { id: "GSE95678",  src: "rummageGEO · GEO", title: "TNF-α response · HUVEC 6h", score: 0.71 },
    { id: "GSE149689", src: "rummageGEO · GEO", title: "PBMC · severe COVID vs mild", score: 0.69 },
  ];
  const rummaGENE = [
    { id: "LINCS · VEGFA OE",     src: "rummaGENE · LINCS",   title: "VEGFA over-expression · HUVEC", score: 0.77 },
    { id: "ARCHS4 · CXCL8 coexpr",src: "rummaGENE · ARCHS4",  title: "CXCL8 co-expression top 250", score: 0.72 },
    { id: "KOMP · Cxcr2-/-",      src: "rummaGENE · MGI",     title: "Cxcr2 knockout neutrophils", score: 0.66 },
    { id: "MSigDB · HALLMARK_IL6",src: "rummaGENE · MSigDB",  title: "HALLMARK IL6/JAK/STAT3", score: 0.63 },
  ];
  return (
    <>
      <div className="section" style={{paddingBottom:6}}>
        <div style={{fontSize:12.5, color:"var(--ink-2)"}}>
          Query CFDE <strong>rummageGEO</strong> and <strong>rummaGENE</strong> indexes for signatures matching this term's hub genes.
        </div>
        <div className="chip-row" style={{marginTop:8}}>
          <span className="chip-pill on">This term</span>
          <span className="chip-pill">This layer</span>
          <span className="chip-pill">Up only</span>
          <span className="chip-pill">Down only</span>
        </div>
      </div>
      <div className="section">
        <h3>rummageGEO · public studies <span className="act">view all 342</span></h3>
        <div className="similarity-list">
          {rummageGEO.map(r => (
            <div key={r.id} className="row">
              <div>
                <div style={{fontSize:12.5}}>{r.title}</div>
                <div className="src">{r.id} · {r.src}</div>
              </div>
              <div className="sc">{r.score.toFixed(2)}</div>
              <button className="btn" style={{padding:"2px 8px"}}>↗</button>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <h3>rummaGENE · gene signatures <span className="act">view all 128</span></h3>
        <div className="similarity-list">
          {rummaGENE.map(r => (
            <div key={r.id} className="row">
              <div>
                <div style={{fontSize:12.5}}>{r.title}</div>
                <div className="src">{r.id}</div>
              </div>
              <div className="sc">{r.score.toFixed(2)}</div>
              <button className="btn" style={{padding:"2px 8px"}}>↗</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Icon set (inline SVG, one-color, Lucide-inspired)
// ============================================================================
function Icon({ name }) {
  const paths = {
    upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    play:     <polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>,
    user:     <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    slides:   <><rect x="2" y="4" width="20" height="14" rx="1"/><path d="M2 20h20"/></>,
    doc:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    md:       <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8v8M7 12l2 3 2-3M14 8v8M14 12l2-2 1 2"/></>,
    excel:    <><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M8 8l8 8M16 8l-8 8"/></>,
    json:     <><path d="M5 8a3 3 0 0 1 3-3H7M5 16a3 3 0 0 0 3 3h0"/><path d="M19 8a3 3 0 0 0-3-3h1M19 16a3 3 0 0 1-3 3h1"/></>,
    csv:      <><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 8v8M15 8v8M3 12h18"/></>,
    img:      <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

window.SearchPill = SearchPill;
window.TopRightCluster = TopRightCluster;
window.MapControls = MapControls;
window.MapLegend = MapLegend;
window.LeftDrawer = LeftDrawer;
window.DetailDrawer = DetailDrawer;
