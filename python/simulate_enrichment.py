"""
Simulated Enrichment for Offline/Testing Mode.

Generates realistic enrichment-like results using GO terms from GO_layers.txt
and genes from the input GMT file. Used when Enrichr API is unavailable.
Results are deterministic based on gene list hash for reproducibility.
"""

import hashlib
import math
import os
import re

import numpy as np
import pandas as pd


# Curated list of well-known GO Biological Process terms with names
# These are real GO terms commonly found in enrichment results
KNOWN_GO_TERMS = [
    ("0006955", "immune response"),
    ("0006954", "inflammatory response"),
    ("0007165", "signal transduction"),
    ("0006915", "apoptotic process"),
    ("0008283", "cell population proliferation"),
    ("0006468", "protein phosphorylation"),
    ("0007049", "cell cycle"),
    ("0006355", "regulation of DNA-templated transcription"),
    ("0007155", "cell adhesion"),
    ("0006281", "DNA repair"),
    ("0006412", "translation"),
    ("0006397", "mRNA processing"),
    ("0016032", "viral process"),
    ("0042981", "regulation of apoptotic process"),
    ("0051607", "defense response to virus"),
    ("0045087", "innate immune response"),
    ("0006357", "regulation of transcription by RNA polymerase II"),
    ("0051301", "cell division"),
    ("0000122", "negative regulation of transcription by RNA polymerase II"),
    ("0045944", "positive regulation of transcription by RNA polymerase II"),
    ("0001525", "angiogenesis"),
    ("0030154", "cell differentiation"),
    ("0006974", "cellular response to DNA damage stimulus"),
    ("0007067", "mitotic nuclear division"),
    ("0010629", "negative regulation of gene expression"),
    ("0010628", "positive regulation of gene expression"),
    ("0006935", "chemotaxis"),
    ("0007186", "G protein-coupled receptor signaling pathway"),
    ("0000381", "regulation of alternative mRNA splicing via spliceosome"),
    ("0043066", "negative regulation of apoptotic process"),
    ("0043065", "positive regulation of apoptotic process"),
    ("0006260", "DNA replication"),
    ("0070374", "positive regulation of ERK1 and ERK2 cascade"),
    ("0007399", "nervous system development"),
    ("0006730", "one-carbon metabolic process"),
    ("0009615", "response to virus"),
    ("0007411", "axon guidance"),
    ("0019221", "cytokine-mediated signaling pathway"),
    ("0032496", "response to lipopolysaccharide"),
    ("0050900", "leukocyte migration"),
    ("0006811", "monoatomic ion transport"),
    ("0001666", "response to hypoxia"),
    ("0048011", "neurotrophin TRK receptor signaling pathway"),
    ("0007264", "small GTPase mediated signal transduction"),
    ("0016055", "Wnt signaling pathway"),
    ("0006469", "negative regulation of protein kinase activity"),
    ("0045893", "positive regulation of DNA-templated transcription"),
    ("0006914", "autophagy"),
    ("0030335", "positive regulation of cell migration"),
    ("0006979", "response to oxidative stress"),
    ("0006805", "xenobiotic metabolic process"),
    ("0019882", "antigen processing and presentation"),
    ("0032091", "negative regulation of protein binding"),
    ("0051402", "neuron apoptotic process"),
    ("0034097", "response to cytokine"),
    ("0006457", "protein folding"),
    ("0043161", "proteasome-mediated ubiquitin-dependent protein catabolic process"),
    ("0006351", "DNA-templated transcription"),
    ("0001932", "regulation of protein phosphorylation"),
    ("0046777", "protein autophosphorylation"),
    ("0006364", "rRNA processing"),
    ("0002376", "immune system process"),
    ("0009966", "regulation of signal transduction"),
    ("0016192", "vesicle-mediated transport"),
    ("0031623", "receptor internalization"),
    ("0071356", "cellular response to tumor necrosis factor"),
    ("0032355", "response to estradiol"),
    ("0045766", "positive regulation of angiogenesis"),
    ("0007596", "blood coagulation"),
    ("0042127", "regulation of cell population proliferation"),
    ("0071260", "cellular response to mechanical stimulus"),
    ("0006936", "muscle contraction"),
    ("0043406", "positive regulation of MAP kinase activity"),
    ("0035666", "TRIF-dependent toll-like receptor signaling pathway"),
    ("0071346", "cellular response to interferon-gamma"),
    ("0034340", "response to type I interferon"),
    ("0002250", "adaptive immune response"),
    ("0006952", "defense response"),
    ("0000398", "mRNA splicing via spliceosome"),
    ("0016071", "mRNA metabolic process"),
]


def simulate_enrichment(gene_list, go_layers_path=None, direction="upregulated",
                         n_terms=None, seed=None):
    """
    Generate simulated enrichment results for testing.

    Uses deterministic randomness based on gene list hash for reproducibility.
    Creates realistic-looking p-values, gene overlaps, and GO term selections.

    Args:
        gene_list: List of gene symbols
        go_layers_path: Path to GO_layers.txt for layer information
        direction: 'upregulated' or 'downregulated'
        n_terms: Number of enriched terms to generate (default: auto)
        seed: Random seed (default: derived from gene list hash)

    Returns:
        list[dict]: Simulated enrichment results in node format
    """
    if len(gene_list) < 5:
        return []

    # Deterministic seed from gene list
    if seed is None:
        gene_hash = hashlib.md5(",".join(sorted(gene_list)).encode()).hexdigest()
        seed = int(gene_hash[:8], 16) % (2**31)

    rng = np.random.RandomState(seed)

    # Load GO layers for hierarchy info
    go_layers_lookup = {}
    if go_layers_path and os.path.exists(go_layers_path):
        df = pd.read_csv(go_layers_path, sep="\t")
        for _, row in df.iterrows():
            goid = str(row.get("ID", "")).replace("GO:", "")
            if goid:
                go_layers_lookup[goid] = {
                    "layer": int(row.get("layer", 0)),
                    "level": int(row.get("level", 0)),
                    "size": int(row.get("size", 0)),
                }

    # Select GO terms - use known terms plus some from GO_layers.txt
    available_terms = list(KNOWN_GO_TERMS)

    # Add some terms from GO_layers that are biological_process
    if go_layers_lookup:
        bp_terms = [(gid, f"biological process {gid}") for gid, info
                     in go_layers_lookup.items()
                     if info.get("layer", 0) in range(1, 8)]
        rng.shuffle(bp_terms)
        available_terms.extend(bp_terms[:30])

    # Determine number of enriched terms
    if n_terms is None:
        n_terms = min(
            len(available_terms),
            max(10, int(len(gene_list) * 0.15)),  # ~15% of input genes
        )
        n_terms = min(n_terms, 60)  # Cap at 60

    # Shuffle and select terms
    indices = rng.permutation(len(available_terms))[:n_terms]
    selected_terms = [available_terms[i] for i in indices]

    nodes = []
    for go_id, go_name in selected_terms:
        # Generate realistic p-value (log-uniform distribution, mostly significant)
        log_p = rng.uniform(-8, -1.3)  # -log10(p) between 1.3 and 8
        adj_p = 10 ** log_p
        sig_score = -log_p

        # Gene overlap (subset of input genes)
        max_overlap = min(len(gene_list), rng.randint(5, 50))
        overlap_size = rng.randint(3, max_overlap + 1)
        overlap_genes = list(rng.choice(gene_list, size=overlap_size, replace=False))

        # Layer from GO_layers lookup
        layer = go_layers_lookup.get(go_id, {}).get("layer", rng.randint(1, 8))
        level = go_layers_lookup.get(go_id, {}).get("level", rng.randint(2, 8))

        nodes.append({
            "go_id": go_id,
            "name": go_name,
            "direction": direction,
            "adjusted_p_value": float(adj_p),
            "significance_score": round(float(sig_score), 4),
            "gene_count": len(overlap_genes),
            "genes": overlap_genes,
            "p_value": float(adj_p * rng.uniform(0.5, 1.0)),
            "combined_score": float(sig_score * rng.uniform(10, 100)),
            "layer": layer,
            "level": level,
        })

    # Sort by significance
    nodes.sort(key=lambda n: n["significance_score"], reverse=True)

    return nodes
