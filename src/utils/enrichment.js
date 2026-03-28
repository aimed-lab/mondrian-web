/**
 * Mondrian Map — Client-Side Enrichment Engine.
 *
 * Runs Fisher's exact test against pre-computed geneset library JSON files,
 * producing results identical in schema to the Python backend pipeline.
 *
 * This is the offline fallback — when the Flask backend is unavailable
 * (e.g., Netlify static deployment), enrichment runs entirely in the browser.
 */

// ── Fisher's exact test (one-tailed, hypergeometric) ─────────────────────

/**
 * Log-factorial via Stirling's approximation for large n,
 * exact lookup for small n.
 */
const LOG_FACT_CACHE = [0];
function logFactorial(n) {
    if (n <= 0) return 0;
    if (LOG_FACT_CACHE[n] !== undefined) return LOG_FACT_CACHE[n];
    // Build cache up to n
    for (let i = LOG_FACT_CACHE.length; i <= n; i++) {
        LOG_FACT_CACHE[i] = LOG_FACT_CACHE[i - 1] + Math.log(i);
    }
    return LOG_FACT_CACHE[n];
}

/**
 * Log of hypergeometric PMF: P(X = k | K, n, N)
 *   K = successes in population
 *   n = sample size (drawn)
 *   N = population size
 *   k = observed successes in sample
 */
function logHypergeomPMF(k, K, n, N) {
    return (
        logFactorial(K) - logFactorial(k) - logFactorial(K - k) +
        logFactorial(N - K) - logFactorial(n - k) - logFactorial(N - K - n + k) -
        logFactorial(N) + logFactorial(n) + logFactorial(N - n)
    );
}

/**
 * One-tailed Fisher's exact test p-value (enrichment = over-representation).
 * P(X >= k) under hypergeometric distribution.
 *
 * @param {number} k - overlap count (genes in both input list and term)
 * @param {number} K - term size (genes in the GO term)
 * @param {number} n - input gene list size
 * @param {number} N - gene universe size
 * @returns {number} p-value
 */
function fisherExactPValue(k, K, n, N) {
    if (k <= 0) return 1.0;

    let logPSum = -Infinity;
    const maxK = Math.min(K, n);

    for (let i = k; i <= maxK; i++) {
        const logP = logHypergeomPMF(i, K, n, N);
        // log-sum-exp
        if (logPSum === -Infinity) {
            logPSum = logP;
        } else {
            const maxLog = Math.max(logPSum, logP);
            logPSum = maxLog + Math.log(Math.exp(logPSum - maxLog) + Math.exp(logP - maxLog));
        }
    }

    return Math.min(1.0, Math.exp(logPSum));
}

/**
 * Benjamini-Hochberg FDR correction.
 * @param {number[]} pValues - array of raw p-values
 * @returns {number[]} adjusted p-values
 */
function benjaminiHochberg(pValues) {
    const n = pValues.length;
    if (n === 0) return [];

    // Create index array and sort by p-value descending
    const indexed = pValues.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => b.p - a.p);

    const adjusted = new Array(n);
    let cumMin = 1.0;

    for (let rank = 0; rank < n; rank++) {
        const origRank = n - rank; // 1-based rank from smallest
        const corrected = (indexed[rank].p * n) / origRank;
        cumMin = Math.min(cumMin, corrected);
        adjusted[indexed[rank].i] = Math.min(1.0, cumMin);
    }

    return adjusted;
}


// ── Enrichment Pipeline ──────────────────────────────────────────────────

/**
 * Run enrichment analysis on a gene list against a loaded library.
 *
 * @param {string[]} geneList - input gene symbols (uppercase)
 * @param {Object} library - parsed library JSON (from public/data/libraries/)
 * @param {number} cutoff - adjusted p-value cutoff (default 0.05)
 * @returns {Object[]} array of enriched term results
 */
export function runEnrichment(geneList, library, cutoff = 0.05) {
    if (!geneList || geneList.length < 5) return [];
    if (!library || !library.terms) return [];

    const inputSet = new Set(geneList.map(g => g.toUpperCase()));
    const N = library.gene_universe.length; // population size

    // Score each term
    const rawResults = [];
    for (const term of library.terms) {
        if (!term.go_id) continue; // skip terms without GO IDs (e.g. some SynGO entries)
        const termGenes = term.genes;
        const K = termGenes.length; // term size
        const overlap = termGenes.filter(g => inputSet.has(g.toUpperCase()));
        const k = overlap.length;

        if (k === 0) continue;

        const pValue = fisherExactPValue(k, K, inputSet.size, N);
        rawResults.push({
            term: term.term,
            go_id: term.go_id,
            genes: overlap,
            gene_count: k,
            term_size: K,
            p_value: pValue,
            category: term.category || null,
        });
    }

    if (rawResults.length === 0) return [];

    // BH correction
    const pValues = rawResults.map(r => r.p_value);
    const adjPValues = benjaminiHochberg(pValues);

    // Attach adjusted p-values and filter
    const results = [];
    for (let i = 0; i < rawResults.length; i++) {
        const adjP = adjPValues[i];
        if (adjP >= cutoff) continue;

        results.push({
            ...rawResults[i],
            adjusted_p_value: adjP,
            significance_score: -Math.log10(Math.max(adjP, 1e-300)),
            combined_score: Math.log(rawResults[i].p_value > 0 ? rawResults[i].p_value : 1e-300) * -1,
        });
    }

    // Sort by significance
    results.sort((a, b) => a.adjusted_p_value - b.adjusted_p_value);

    return results;
}


/**
 * Convert enrichment results to the node format expected by the Mondrian Map pipeline.
 *
 * @param {Object[]} enrichResults - from runEnrichment()
 * @param {string} direction - 'upregulated', 'downregulated', or 'shared'
 * @returns {Object[]} nodes in pipeline format
 */
export function enrichmentToNodes(enrichResults, direction = 'upregulated') {
    return enrichResults.map(r => ({
        go_id: r.go_id,
        name: r.term,
        direction,
        adjusted_p_value: r.adjusted_p_value,
        significance_score: Math.round(r.significance_score * 10000) / 10000,
        gene_count: r.gene_count,
        genes: r.genes,
        p_value: r.p_value,
        combined_score: r.combined_score,
    }));
}


/**
 * Deduplicate nodes that appear in both up and down lists.
 * Shared terms get direction = 'shared' and merged gene lists.
 */
export function deduplicateNodes(allNodes) {
    const seen = {};
    const deduped = [];

    for (const node of allNodes) {
        const gid = node.go_id;
        if (seen[gid]) {
            const existing = seen[gid];
            existing.direction = 'shared';
            const mergedGenes = [...new Set([...existing.genes, ...node.genes])];
            existing.genes = mergedGenes;
            existing.gene_count = mergedGenes.length;
            if (node.significance_score > existing.significance_score) {
                existing.significance_score = node.significance_score;
                existing.adjusted_p_value = node.adjusted_p_value;
            }
        } else {
            seen[gid] = { ...node };
            deduped.push(seen[gid]);
        }
    }

    return deduped;
}
