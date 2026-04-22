/* global React */

// Import / mapping modal: appears when users upload scRNA-seq or pull from GEO.
// Organizes samples → conditions/states/cell types.
function ImportModal({ open, onClose, onFinish }) {
  const [step, setStep] = React.useState(1);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header>
          <h2>Map your dataset</h2>
          <span style={{color:"var(--ink-3)", fontSize:12}}>GSE164073 · scRNA-seq · 68,412 cells · detected <strong style={{color:"var(--ink)"}}>h5ad</strong></span>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <div className="body">
          <div style={{display:"flex", gap:6, marginBottom:16, fontSize:11.5, color:"var(--ink-3)"}}>
            {["1 · Detect", "2 · Group", "3 · Contrasts"].map((s, i) => (
              <div key={i} style={{
                flex: 1, padding: "6px 10px",
                borderBottom: `2px solid ${step > i ? "#111" : "var(--rule)"}`,
                color: step === i+1 ? "var(--ink)" : "var(--ink-3)",
                fontWeight: step === i+1 ? 600 : 400,
              }}>{s}</div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <div className="step">
                <h4>Detected metadata columns</h4>
                <p style={{margin:0, fontSize:12.5, color:"var(--ink-2)"}}>We found these obs columns. Confirm which are biological axes.</p>
              </div>
              <table className="table">
                <thead><tr><th>Column</th><th>Type</th><th>Unique values</th><th>Use as</th></tr></thead>
                <tbody>
                  <tr><td className="name">condition</td><td>categorical</td><td>2 · healthy, covid</td><td><select defaultValue="condition"><option>condition</option><option>sample</option><option>ignore</option></select></td></tr>
                  <tr><td className="name">cell_type</td><td>categorical</td><td>11 · CD4, CD8, NK, B…</td><td><select defaultValue="celltype"><option>celltype</option><option>batch</option><option>ignore</option></select></td></tr>
                  <tr><td className="name">patient_id</td><td>categorical</td><td>24</td><td><select defaultValue="sample"><option>sample</option><option>batch</option><option>ignore</option></select></td></tr>
                  <tr><td className="name">sex</td><td>categorical</td><td>2</td><td><select defaultValue="covariate"><option>covariate</option><option>ignore</option></select></td></tr>
                  <tr><td className="name">age</td><td>numeric</td><td>21 – 84</td><td><select defaultValue="covariate"><option>covariate</option><option>ignore</option></select></td></tr>
                  <tr><td className="name">n_counts</td><td>numeric</td><td>quality</td><td><select defaultValue="qc"><option>qc</option></select></td></tr>
                </tbody>
              </table>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="step">
                <h4>Group cells into cohorts</h4>
                <p style={{margin:0, fontSize:12.5, color:"var(--ink-2)"}}>We generated cohorts at the intersection of cell_type × condition. Deselect what you don't need.</p>
              </div>
              <div className="cohort-list" style={{maxHeight:260, overflow:"auto"}}>
                {[
                  "CD4 T · covid", "CD4 T · healthy",
                  "CD8 T · covid", "CD8 T · healthy",
                  "NK · covid", "NK · healthy",
                  "Monocyte · covid", "Monocyte · healthy",
                  "B cell · covid", "B cell · healthy",
                  "DC · covid", "DC · healthy",
                ].map(x => (
                  <label key={x} className="cohort on">
                    <input type="checkbox" defaultChecked/>
                    <div>{x}</div>
                    <span className="n">n≈{Math.floor(Math.random()*9000+300)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="step">
                <h4>Define contrasts</h4>
                <p style={{margin:0, fontSize:12.5, color:"var(--ink-2)"}}>Each contrast becomes a MondrianMap. DEGs computed with Wilcoxon rank-sum + BH FDR.</p>
              </div>
              <table className="table">
                <thead><tr><th>Group A</th><th>Group B</th><th>Within</th><th>Test</th><th></th></tr></thead>
                <tbody>
                  {[
                    ["covid", "healthy", "CD4 T"],
                    ["covid", "healthy", "CD8 T"],
                    ["covid", "healthy", "Monocyte"],
                    ["covid", "healthy", "NK"],
                  ].map((c, i) => (
                    <tr key={i}>
                      <td className="name">{c[0]}</td>
                      <td className="name">{c[1]}</td>
                      <td className="name">{c[2]}</td>
                      <td>Wilcoxon</td>
                      <td>✓</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn" style={{marginTop:10}}>+ Add contrast</button>
            </div>
          )}

          <div style={{display:"flex", gap:8, marginTop:16, justifyContent:"flex-end"}}>
            <button className="btn" onClick={onClose}>Cancel</button>
            {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
            {step < 3 && <button className="btn primary" onClick={() => setStep(step + 1)}>Next →</button>}
            {step === 3 && <button className="btn primary" onClick={() => { setStep(1); onFinish(); }}>Run 4 MondrianMaps</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{maxWidth:420}} onClick={e => e.stopPropagation()}>
        <header>
          <h2>Sign in — optional</h2>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <div className="body">
          <p style={{margin:"0 0 14px", color:"var(--ink-2)", fontSize:13}}>
            Analysis works without an account. Sign in only to save histories, share notebooks, and sync your CFDE data access.
          </p>
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            <button className="btn" style={{justifyContent:"center", padding:"10px"}}>Continue with ORCID</button>
            <button className="btn" style={{justifyContent:"center", padding:"10px"}}>Continue with Google</button>
            <button className="btn" style={{justifyContent:"center", padding:"10px"}}>Continue with email</button>
          </div>
          <div style={{marginTop:14, fontSize:12, color:"var(--ink-3)"}}>
            <strong style={{color:"var(--ink)", fontWeight:500}}>What gets stored</strong>
            <ul style={{marginTop:4, paddingLeft:18}}>
              <li>Analysis history (input gene sets, chosen layers, embeddings)</li>
              <li>Named notebooks and exports</li>
              <li>Your own custom GO term annotations</li>
            </ul>
          </div>
          <button className="btn primary" style={{marginTop:14, width:"100%", justifyContent:"center"}}
            onClick={onClose}>Continue without an account</button>
        </div>
      </div>
    </div>
  );
}

window.ImportModal = ImportModal;
window.LoginModal = LoginModal;
