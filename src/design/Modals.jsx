import React, { useState } from 'react';

export function ImportModal({ open, onClose, onFinish }) {
    const [step, setStep] = useState(1);
    if (!open) return null;
    return (
        <div className="modal-bg" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header>
                    <h2>Map your dataset</h2>
                    <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                        Pull from GEO / ArrayExpress · or drop a counts matrix / .h5ad file
                    </span>
                    <button className="close" onClick={onClose}>×</button>
                </header>
                <div className="body">
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16, fontSize: 11.5, color: 'var(--ink-3)' }}>
                        {['1 · Detect', '2 · Group', '3 · Contrasts'].map((s, i) => (
                            <div key={i} style={{
                                flex: 1, padding: '6px 10px',
                                borderBottom: `2px solid ${step > i ? '#111' : 'var(--rule)'}`,
                                color: step === i + 1 ? 'var(--ink)' : 'var(--ink-3)',
                                fontWeight: step === i + 1 ? 600 : 400,
                            }}>{s}</div>
                        ))}
                    </div>
                    {step === 1 && (
                        <div className="drop" style={{ padding: '22px 14px' }}>
                            <strong>Drop RNA-seq file</strong>
                            <span>.h5ad · .rds · 10x · counts matrix · DESeq2 output</span>
                        </div>
                    )}
                    {step === 2 && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                            Cohort grouping will appear after a dataset is dropped. Stub for now.
                        </div>
                    )}
                    {step === 3 && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                            Define contrasts (Group A vs Group B). Stub for now.
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                        <button className="btn" onClick={onClose}>Cancel</button>
                        {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
                        {step < 3 && <button className="btn primary" onClick={() => setStep(step + 1)}>Next →</button>}
                        {step === 3 && (
                            <button className="btn primary" onClick={() => { setStep(1); onFinish(); }}>
                                Finish
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LoginModal({ open, onClose }) {
    if (!open) return null;
    return (
        <div className="modal-bg" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                <header>
                    <h2>Sign in — optional</h2>
                    <button className="close" onClick={onClose}>×</button>
                </header>
                <div className="body">
                    <p style={{ margin: '0 0 14px', color: 'var(--ink-2)', fontSize: 13 }}>
                        Analysis works without an account. Sign in only to save histories, share notebooks, and sync your CFDE data access.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="btn" style={{ justifyContent: 'center', padding: '10px' }}>Continue with ORCID</button>
                        <button className="btn" style={{ justifyContent: 'center', padding: '10px' }}>Continue with Google</button>
                        <button className="btn" style={{ justifyContent: 'center', padding: '10px' }}>Continue with email</button>
                    </div>
                    <button className="btn primary" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
                        onClick={onClose}>
                        Continue without an account
                    </button>
                </div>
            </div>
        </div>
    );
}
