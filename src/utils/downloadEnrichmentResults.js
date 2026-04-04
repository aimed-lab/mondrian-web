export function downloadEnrichmentJSON(nodes, edges, metadata, filename) {
    if (!nodes || !metadata) return;

    const terms = nodes.map(n => {
        const pVal = n.pValue !== undefined ? n.pValue : n.adjusted_p_value;
        const rawGoId = n.go_id || n.id?.replace('GO:', '');
        return {
            direction: n.direction || '',
            go_id: rawGoId?.startsWith('GO:') ? rawGoId : `GO:${rawGoId}`,
            name: n.name || '',
            layer: n.layer || 0,
            significance_score: n.significance_score ? Number(n.significance_score.toFixed(4)) : 0,
            adjusted_p_value: typeof pVal === 'number' ? Number(pVal.toExponential(4)) : (pVal || null),
            gene_count: n.gene_count || 0,
            genes: n.genes || []
        };
    });

    const crosstalks = edges.map(e => {
        const source = e.source.startsWith('GO:') ? e.source : `GO:${e.source}`;
        const target = e.target.startsWith('GO:') ? e.target : `GO:${e.target}`;
        const w = e.weight !== undefined ? e.weight : (e.jaccard !== undefined ? e.jaccard : 0);
        return {
            source,
            target,
            weight: Number(w.toFixed(4))
        };
    });

    const meta = metadata || {};
    const resultObj = {
        metadata: {
            case_study: meta.case_study || 'N/A',
            contrast: meta.contrast || 'N/A',
            library: meta.library || 'N/A',
            up_gene_count: meta.up_gene_count || 0,
            down_gene_count: meta.down_gene_count || 0,
            term_count: terms.length,
            crosstalk_count: crosstalks.length,
            generated_at: meta.generated_at || new Date().toISOString()
        },
        go_terms: terms,
        crosstalks: crosstalks
    };

    const content = JSON.stringify(resultObj, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
