/**
 * promptBuilder.js
 *
 * Assembles the system prompt and user prompt for the AI Explain feature.
 * Inspired by GeneSetCart's hypothesis generation (Marino et al., GigaScience 2025),
 * adapted for the Mondrian Map's spatial enrichment context.
 */

import { buildLINCSContext, describeContrast } from './parseLINCSId.js';

// ---------------------------------------------------------------------------
// System prompt — defines the LLM's role and behaviour constraints
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a computational biology expert and gene set analyst. Your role is to interpret gene set enrichment analysis results visualized in a Mondrian Map and generate scientifically rigorous, mechanistically grounded hypotheses.

You combine deep knowledge of molecular biology, pathway crosstalk, gene regulation, and systems biology to produce insights that are both biologically plausible and experimentally testable.

Rules you MUST follow:
- Reference every GO term name in its EXACT original form (including GO:XXXXXXX identifiers). Never abbreviate or paraphrase pathway names.
- Reference gene symbols EXACTLY as provided (all uppercase).
- Never fabricate gene names, pathway identifiers, or p-values.
- Write in a professional scientific tone suitable for a bioinformatics research publication.
- Do not begin any section with redundant phrases like "Hypothesis:" or "Based on the analysis...". Start directly with the scientific content.`;

// ---------------------------------------------------------------------------
// User prompt template
// ---------------------------------------------------------------------------
function buildUserPrompt(selectedNodes, relevantEdges, metadata, parameters) {
  // --- Analysis context ---
  const library    = metadata?.library || "GO_Biological_Process_2023";
  const upCount    = metadata?.up_gene_count  ?? "N/A";
  const downCount  = metadata?.down_gene_count ?? "N/A";
  const contrastRaw = metadata?.contrast || metadata?.case_study || "User-provided gene sets";
  const pCutoff    = parameters?.pValueCutoff    ?? 0.05;
  const jThreshold = parameters?.jaccardThreshold ?? 0.15;

  // Parse LINCS identifier into a human-readable context block.
  // Falls back gracefully to raw strings for non-LINCS datasets.
  const experimentContext = buildLINCSContext(metadata?.contrast, metadata?.case_study);
  const contrastSentence  = describeContrast(contrastRaw) || contrastRaw;

  // --- Build selected terms block ---
  const termsBlock = selectedNodes
    .map((node) => {
      const genes = (node.genes || []).slice(0, 30); // cap at 30 for token budget
      const geneStr = genes.join(", ") + (node.genes?.length > 30 ? ` ... (${node.genes.length} total)` : "");
      return [
        `- Term: ${node.name || node.id} (${node.id})`,
        `  Direction: ${node.direction || "unknown"}`,
        `  Adjusted p-value: ${node.pValue != null ? node.pValue.toExponential(2) : "N/A"}`,
        `  -log10(p): ${node.significance_score != null ? node.significance_score.toFixed(2) : "N/A"}`,
        `  Gene count: ${node.gene_count || genes.length}`,
        `  Genes: ${geneStr || "N/A"}`,
      ].join("\n");
    })
    .join("\n\n");

  // --- Build crosstalk block ---
  let crosstalkBlock = "No crosstalk edges between the selected terms.";
  if (relevantEdges.length > 0) {
    // We need a lookup from GO ID → node for gene overlap
    const nodeById = new Map(selectedNodes.map((n) => [n.id, n]));

    crosstalkBlock = relevantEdges
      .map((edge) => {
        const srcNode = nodeById.get(edge.source);
        const tgtNode = nodeById.get(edge.target);
        const srcName = srcNode?.name || edge.source;
        const tgtName = tgtNode?.name || edge.target;

        // Compute shared genes if both nodes have gene lists
        let sharedGenes = [];
        if (srcNode?.genes && tgtNode?.genes) {
          const tgtSet = new Set(tgtNode.genes);
          sharedGenes = srcNode.genes.filter((g) => tgtSet.has(g));
        }
        const sharedStr = sharedGenes.length > 0
          ? sharedGenes.slice(0, 20).join(", ") + (sharedGenes.length > 20 ? ` ... (${sharedGenes.length} total)` : "")
          : "not computed";

        return [
          `- ${srcName} (${edge.source}) <-> ${tgtName} (${edge.target})`,
          `  Jaccard Index: ${edge.weight?.toFixed(3) || "N/A"}`,
          `  Shared genes: ${sharedStr}`,
        ].join("\n");
      })
      .join("\n\n");
  }

  // --- Assemble full user prompt ---
  return `You are analyzing a Mondrian Map visualization of gene set enrichment results. The map displays enriched Gene Ontology (GO) terms as colored blocks, where block size reflects statistical significance (-log10 adjusted p-value) and connections between blocks represent gene overlap (Jaccard Index).

## Experimental Context
${experimentContext}

## Analysis Parameters
- Enrichment Library: ${library}
- Input gene signature: ${upCount} upregulated genes, ${downCount} downregulated genes
- Experimental condition: ${contrastSentence}
- Significance cutoff: adjusted p-value < ${pCutoff}
- Crosstalk threshold: Jaccard Index ≥ ${jThreshold}

## Selected Enriched Terms
The user has selected the following ${selectedNodes.length} enriched GO terms from the Mondrian Map for deeper analysis:

${termsBlock}

Each term above includes: the GO term name and ID, direction of regulation (upregulated, downregulated, or shared), adjusted p-value, the count of overlapping genes, and the specific gene symbols driving the enrichment.

## Crosstalk Relationships
The following pairs of selected terms share overlapping genes (Jaccard Index shown), indicating potential biological crosstalk:

${crosstalkBlock}

## Instructions
Based on the enrichment results and crosstalk relationships above, provide:

1. **Biological Narrative** (4-5 sentences): Synthesize the selected enriched terms into a cohesive biological story. Explain how these pathways and processes may be mechanistically connected in the context of the input gene expression changes. Reference specific GO term names exactly as provided.

2. **Crosstalk Interpretation** (3-4 sentences): For each significant crosstalk pair, explain why these terms share overlapping genes. Identify hub genes that appear across multiple terms and hypothesize their functional roles. Use exact gene symbols as provided.

3. **Testable Hypothesis** (2-3 sentences): Propose a specific, experimentally testable hypothesis that emerges from the pattern of enriched terms and their crosstalk. Suggest what type of experiment (e.g., knockout, ChIP-seq, co-IP, single-cell RNA-seq) could validate or refute this hypothesis.

4. **Potential Implications** (2-3 sentences): Describe the broader biological or translational significance. If applicable, connect findings to known disease mechanisms, therapeutic targets, or unexplored biology.

## Output Format (STRICT — follow exactly)
Use this exact structure. Each section header must be on its own line, followed immediately by the body text on the next line. Do not add blank lines between the header and its body.

## Biological Narrative
[4-5 sentences here]

## Crosstalk Interpretation
[3-4 sentences here]

## Testable Hypothesis
[2-3 sentences here]

## Potential Implications
[2-3 sentences here]

Additional rules:
- Limit total response to approximately 15-20 sentences.
- Reference every GO term name in its exact original form (including IDs like GO:XXXXXXX). Do not abbreviate or paraphrase.
- Reference gene symbols exactly as provided (all uppercase). Use **GeneSymbol** markdown to highlight gene names.
- Do not begin any section with redundant phrases like "Hypothesis:" or "Based on the analysis...". Start directly with the scientific content.
- Write in a professional scientific tone suitable for a bioinformatics research publication.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the system + user prompt pair for the AI Explain feature.
 *
 * @param {Array} selectedNodes   – entities selected on the Mondrian Map
 * @param {Array} allEdges        – all relationships (will be filtered to selected pairs)
 * @param {Object} metadata       – layoutJson.metadata
 * @param {Object} parameters     – current ParameterControls state
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildPrompt(selectedNodes, allEdges, metadata, parameters) {
  // Filter edges to only those between selected nodes
  const selectedIds = new Set(selectedNodes.map((n) => n.id));
  const relevantEdges = (allEdges || []).filter(
    (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
  );

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(selectedNodes, relevantEdges, metadata, parameters),
  };
}
