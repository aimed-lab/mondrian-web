/**
 * AIExplainPanel — slide-out panel for AI-generated biological hypotheses.
 *
 * Only accessible when the user has an active selection on the Mondrian Map.
 * Displays selected GO terms, the crosstalks between them, and the AI output
 * structured as: Biological Narrative · Crosstalk Interpretation ·
 * Testable Hypothesis · Potential Implications.
 *
 * App colour palette (Mondrian):
 *   Black   #1D1D1D  — primary text, borders
 *   Red     #E30022  — upregulated / Testable Hypothesis accent
 *   Blue    #0078BF  — downregulated / Biological Narrative accent
 *   Yellow  #FFD700  — shared / Crosstalk Interpretation accent
 */

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Sparkles, X, AlertCircle, Clock, Minus, RotateCcw, Copy, Check, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIExplain } from '../hooks/useAIExplain';
import { getLayerSuffix } from '../utils/layerSuffix.js';
import { CONFIG } from '../config.js';
import { svgToPngBlob, blobToBase64 } from '../utils/imageExport.js';

// ---------------------------------------------------------------------------
// Brand colours
// ---------------------------------------------------------------------------
const BRAND = {
  black: '#1D1D1D',
  red: '#E30022',
  blue: '#0078BF',
  yellow: '#FFD700',
  blueDark: '#005f96',
  redDark: '#b8001a',
  yellowDark: '#8B6914',
  gray: '#666666',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelevantEdges(selectedNodes, allEdges, selectedRelationshipIds) {
  const selectedIds = new Set(selectedNodes.map((n) => n.id));
  const hasExplicitEdges = selectedRelationshipIds?.size > 0;

  return (allEdges || []).filter((e) => {
    if (!selectedIds.has(e.source) || !selectedIds.has(e.target)) return false;
    if (hasExplicitEdges) {
      const fwd = `${e.source}-${e.target}`;
      const rev = `${e.target}-${e.source}`;
      return selectedRelationshipIds.has(fwd) || selectedRelationshipIds.has(rev);
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

const SECTION_NAMES = [
  'Biological Narrative',
  'Crosstalk Interpretation',
  'Testable Hypothesis',
  'Potential Implications',
];

const SECTION_META = {
  'Biological Narrative': { borderColor: BRAND.blue, labelColor: BRAND.blueDark },
  'Crosstalk Interpretation': { borderColor: BRAND.yellow, labelColor: BRAND.yellowDark },
  'Testable Hypothesis': { borderColor: BRAND.red, labelColor: BRAND.redDark },
  'Potential Implications': { borderColor: BRAND.black, labelColor: BRAND.gray },
};

function parseInline(str, keyPrefix = '') {
  const parts = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(str.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}b${m.index}`} className="font-semibold" style={{ color: BRAND.black }}>{m[1]}</strong>);
    } else {
      parts.push(<em key={`${keyPrefix}i${m.index}`} className="italic">{m[2]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push(str.slice(last));
  return parts;
}

function renderBody(text) {
  return text
    .split(/\n{2,}/)
    .map((para, pi) => {
      const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      return (
        <p key={pi} className="text-xs leading-relaxed" style={{ color: '#374151' }}>
          {parseInline(lines.join(' '), `p${pi}`)}
        </p>
      );
    })
    .filter(Boolean);
}

const SECTION_NAME_PATTERN = SECTION_NAMES.map(n => n.replace(/\s/g, '\\s+')).join('|');
const HEADER_LINE_RE = new RegExp(
  `^(?:\\d+\\.\\s*)?(?:#{1,3}\\s*)?\\*{0,2}\\s*(${SECTION_NAME_PATTERN})\\s*\\*{0,2}\\s*:?\\s*`,
  'i'
);

function parseHypothesisSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(HEADER_LINE_RE);
    if (m) {
      if (current) sections.push(current);
      const raw = m[1].trim();
      const canonical = SECTION_NAMES.find(
        n => n.replace(/\s+/g, ' ').toLowerCase() === raw.replace(/\s+/g, ' ').toLowerCase()
      ) ?? raw;
      const inline = line.slice(m[0].length).trim();
      current = { header: canonical, bodyLines: inline ? [inline] : [] };
    } else if (current) {
      current.bodyLines.push(line);
    } else if (line.trim()) {
      if (!sections.length || sections[sections.length - 1].header !== null) {
        sections.push({ header: null, bodyLines: [] });
      }
      sections[sections.length - 1].bodyLines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonLoader() {
  const rows = ['w-3/4', 'w-full', 'w-5/6', 'w-full', 'w-2/3', 'w-full', 'w-4/5', 'w-3/4', 'w-1/2'];
  return (
    <div className="space-y-2.5 animate-pulse mt-4">
      <div className="h-3 bg-gray-200 w-44 mb-5" />
      {rows.map((w, i) => <div key={i} className={`h-2.5 bg-gray-100 ${w}`} />)}
      <div className="h-3 bg-gray-200 w-40 mt-6 mb-4" />
      {rows.slice(0, 5).map((w, i) => <div key={`b${i}`} className={`h-2.5 bg-gray-100 ${w}`} />)}
    </div>
  );
}

function HypothesisView({ text }) {
  if (!text) return null;
  const sections = parseHypothesisSections(text);
  return (
    <div className="mt-4 space-y-5">
      {sections.map((section, i) => {
        const body = section.bodyLines.join('\n').trim();
        const meta = section.header ? SECTION_META[section.header] : null;
        if (!body && !section.header) return null;
        return (
          <div
            key={i}
            className="pl-4 py-0.5"
            style={{ borderLeft: `3px solid ${meta?.borderColor ?? '#D1D5DB'}` }}
          >
            {section.header && (
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: meta?.labelColor ?? BRAND.gray }}
              >
                {section.header}
              </p>
            )}
            <div className="space-y-2">
              {renderBody(body)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ErrorDisplay({ message, resetAt }) {
  const isRateLimit = message?.toLowerCase().includes('rate limit');
  const minutesLeft = resetAt ? Math.max(1, Math.ceil((resetAt - Date.now()) / 60_000)) : null;
  return (
    <div className="mt-4 flex items-start gap-2 p-3" style={{ border: `1px solid ${BRAND.red}20`, background: `${BRAND.red}08` }}>
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: BRAND.red }} />
      <div className="text-xs" style={{ color: '#7f1d1d' }}>
        <p>{message}</p>
        {isRateLimit && minutesLeft && (
          <p className="mt-1 flex items-center gap-1" style={{ color: '#9ca3af' }}>
            <Clock className="w-3 h-3" />
            Available again in ~{minutesLeft} min
          </p>
        )}
      </div>
    </div>
  );
}

function LimitReachedNotice({ resetAt }) {
  const minutesLeft = resetAt ? Math.max(1, Math.ceil((resetAt - Date.now()) / 60_000)) : null;
  return (
    <div className="mt-4" style={{ border: `1px solid #E5E7EB` }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
        <Clock className="w-3 h-3" style={{ color: '#6B7280' }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6B7280' }}>
          Hourly Limit Reached
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs" style={{ color: '#374151' }}>
          You've used {CONFIG.HOURLY_REQUEST_LIMIT} hourly requests for this session.
          {minutesLeft && (
            <> Resets in approximately <span className="font-semibold">{minutesLeft} minute{minutesLeft > 1 ? 's' : ''}</span>.</>
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function AIExplainPanel({
  selectedNodes,
  selectedRelationshipIds,
  allEdges,
  metadata,
  parameters,
  getSelectionSVG,
}) {
  const relevantEdges = useMemo(
    () => getRelevantEdges(selectedNodes, allEdges, selectedRelationshipIds),
    [selectedNodes, allEdges, selectedRelationshipIds]
  );

  const {
    explanation,
    modelName,
    loading,
    error,
    remaining,
    resetAt,
    requestExplanation,
    clearExplanation,
  } = useAIExplain();

  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('idle');
  const downloadTimerRef = useRef(null);

  useEffect(() => {
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    setDownloadStatus('idle');
  }, [explanation]);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (!explanation) return;
    navigator.clipboard.writeText(explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [explanation]);

  const handleDownloadExplanation = useCallback(async () => {
    if (!explanation) return;
    setDownloadStatus('processing');

    const caseName = (metadata?.case_study || 'analysis').replace(/\s+/g, '_');
    const layerSuffix = getLayerSuffix(parameters?.selectedLayer);
    const filename = `ai_hypothesis_${caseName}${layerSuffix}.md`;

    // 1. Get the Map Image (PNG Base64)
    let headerImage = '';
    if (getSelectionSVG) {
      const svgString = getSelectionSVG();
      if (svgString) {
        try {
          const pngBlob = await svgToPngBlob(svgString);
          const base64Png = await blobToBase64(pngBlob);
          headerImage = `![Selected Mondrian Map](${base64Png})\n\n`;
        } catch (e) {
          console.error("Failed to generate PNG for download:", e);
        }
      }
    }

    // 2. Prepare Detailed Experiment Metadata (Markdown Tables)
    const upTermCount = selectedNodes.filter(t => t.direction === 'upregulated').length;
    const downTermCount = selectedNodes.filter(t => t.direction === 'downregulated').length;

    const termsTable = selectedNodes && selectedNodes.length > 0
      ? `\n#### Selected GO Terms (${selectedNodes.length})\n| GO ID | Term Name | Direction | Layer | -log10(p) | Adj. p-value | Genes Count | Genes |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n` +
      selectedNodes.map(n => `| ${n.id} | ${n.name || 'N/A'} | ${n.direction} | ${n.layer ?? 'N/A'} | ${n.significance_score?.toFixed(4) || 'N/A'} | ${n.pValue?.toExponential(4) || 'N/A'} | ${n.gene_count || 0} | ${n.genes?.slice(0, 10).join(', ')}${n.genes?.length > 10 ? '...' : ''} |`).join('\n')
      : '';

    const crosstalkTable = relevantEdges && relevantEdges.length > 0
      ? `\n#### Selected Crosstalks (${relevantEdges.length})\n| Source | Target | Jaccard Index |\n| :--- | :--- | :--- |\n` +
      relevantEdges.map(e => `| ${e.source} | ${e.target} | ${e.weight?.toFixed(4) || 'N/A'} |`).join('\n')
      : '';

    const metadataSection = `
---
### Experiment Information
- **Case Study:** ${metadata?.case_study || 'N/A'}
- **Contrast:** ${metadata?.contrast || 'N/A'}
- **Enrichment Library:** ${metadata?.enrichment_library || 'N/A'}
- **Generated At:** ${metadata?.generated_at ? new Date(metadata.generated_at).toLocaleString() : new Date().toLocaleString()}
- **AI Model:** ${modelName}

#### Summary Metrics
- **Total Selected Terms:** ${selectedNodes.length}
- **Upregulated Terms:** ${upTermCount}
- **Downregulated Terms:** ${downTermCount}
- **Total Selected Crosstalks:** ${relevantEdges.length}

${termsTable}
${crosstalkTable}

#### Input Gene Sets
| Set | Gene Count | Genesets |
| :--- | :--- | :--- |
| Upregulated | ${metadata?.up_gene_count || 0} | ${metadata?.up_genes?.slice(0, 100).join(', ') || 'None'}${metadata?.up_genes?.length > 100 ? '...' : ''} |
| Downregulated | ${metadata?.down_gene_count || 0} | ${metadata?.down_genes?.slice(0, 100).join(', ') || 'None'}${metadata?.down_genes?.length > 100 ? '...' : ''} |
---
`;

    const fullContent = `# AI Hypothesis\n\n${headerImage}${explanation}\n\n${metadataSection}`;

    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadStatus('success');
    if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    downloadTimerRef.current = setTimeout(() => {
      setDownloadStatus('idle');
      downloadTimerRef.current = null;
    }, 2000);
  }, [explanation, metadata, modelName, parameters, getSelectionSVG, selectedNodes, relevantEdges]);

  useEffect(() => {
    clearExplanation();
    setCopied(false);
  }, [selectedNodes, clearExplanation]);

  const handleGenerate = useCallback(
    () => requestExplanation(selectedNodes, relevantEdges, metadata, parameters),
    [selectedNodes, relevantEdges, metadata, parameters, requestExplanation]
  );

  const handleRegenerate = useCallback(
    () => requestExplanation(selectedNodes, relevantEdges, metadata, parameters, /* force */ true),
    [selectedNodes, relevantEdges, metadata, parameters, requestExplanation]
  );

  const nodeCount = selectedNodes?.length ?? 0;
  const canGenerate = nodeCount >= 1 && remaining > 0 && !loading;

  return (
    <div className="w-full flex flex-col font-sans border-2 border-black bg-white">
      {!explanation && !loading && (
        <div className="p-5">
          {nodeCount > 0 ? (
            remaining > 0 ? (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                style={{
                  background: canGenerate ? BRAND.black : '#E5E7EB',
                  color: canGenerate ? '#FFFFFF' : '#9CA3AF',
                  cursor: canGenerate ? 'pointer' : 'not-allowed',
                }}
              >
                <Sparkles className="w-4 h-4" />
                Generate AI Hypothesis
                <span className="ml-1 bg-white/20 text-white text-xs font-bold px-1.5 py-0.5">
                  {nodeCount}
                </span>
              </button>
            ) : (
              <LimitReachedNotice resetAt={resetAt} />
            )
          ) : (
            <div className="text-center py-4 bg-gray-50 border border-gray-100">
              <p className="text-sm font-medium" style={{ color: '#9CA3AF' }}>Ready to generate an AI hypothesis?</p>
              <p className="text-xs mt-1" style={{ color: '#D1D5DB' }}>Select GO terms or crosstalks from the Mondrian Map or <br /> Enrichment Results to get started.</p>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="p-5 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" style={{ color: BRAND.black }} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Generating hypothesis…
            </p>
          </div>
          <SkeletonLoader />
        </div>
      )}

      {error && remaining > 0 && (
        <div className="p-5">
          <ErrorDisplay message={error} resetAt={resetAt} />
        </div>
      )}

      {explanation && !loading && (
        <div className="p-5 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: BRAND.black }} />
              <p className="text-xs font-bold uppercase tracking-widest text-black">
                AI Hypothesis
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] transition-colors"
                style={{ color: copied ? BRAND.blue : '#9CA3AF' }}
              >
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
          </div>

          <HypothesisView text={explanation} />

          <div className="mt-6 flex flex-col gap-2">
            {remaining > 0 && (
              <button
                onClick={handleRegenerate}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{ border: `1px solid ${BRAND.black}`, color: BRAND.black, background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = BRAND.black; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = BRAND.black; }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Regenerate
              </button>
            )}

            <button
              onClick={handleDownloadExplanation}
              disabled={downloadStatus === 'processing'}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{ background: BRAND.black, color: '#FFFFFF' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#333'; }}
              onMouseLeave={e => { e.currentTarget.style.background = BRAND.black; }}
            >
              {downloadStatus === 'processing' ? (
                <> <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Processing...</>
              ) : downloadStatus === 'success' ? (
                <><Check className="w-3.5 h-3.5" /> Downloaded</>
              ) : (
                <><Download className="w-3.5 h-3.5" /> Download AI Hypothesis</>
              )}
            </button>
          </div>

          {remaining === 0 && <LimitReachedNotice resetAt={resetAt} />}

          <div className="mt-4 pt-4" style={{ borderTop: '1px solid #F3F4F6' }}>
            <p className="text-[9px] leading-relaxed" style={{ color: '#D1D5DB' }}>
              Generated by {modelName} from enrichment statistics. Hypotheses are AI-assisted and require experimental validation. Always verify gene symbols and pathway identifiers against primary databases. AI model may make mistakes or hallucinations.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
