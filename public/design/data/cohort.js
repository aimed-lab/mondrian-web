// Mock metadata and enrichment data for the prototype.
// Values are synthesized from the manuscript's case studies (LINCS TP53/KRAS,
// GTEx aging, MoTrPAC exercise) to give the UI believable content.

window.MM_DATASETS = [
  {
    id: "lincs_tp53_kras",
    source: "LINCS L1000 CRISPR",
    title: "TP53 / KRAS knockout · A549",
    format: "bulk",
    species: "Homo sapiens",
    assay: "L1000 CRISPR, 96h",
    groupBy: "perturbation",
    cohorts: [
      { id: "tp53_r1", label: "TP53 KO · rep 1 (K12)", n: 3, up: 26, down: 109, total: 135 },
      { id: "tp53_r2", label: "TP53 KO · rep 2 (M16)", n: 3, up: 11, down: 110, total: 121 },
      { id: "kras_r1", label: "KRAS KO · rep 1",       n: 3, up: 16, down: 34,  total: 50 },
      { id: "kras_r2", label: "KRAS KO · rep 2",       n: 3, up: 33, down: 0,   total: 33 },
      { id: "myc",     label: "MYC KO",                n: 3, up: 9,  down: 17,  total: 27 },
      { id: "egfr",    label: "EGFR KO",               n: 3, up: 1,  down: 28,  total: 29 },
    ],
  },
  {
    id: "gtex_aging",
    source: "GTEx",
    title: "Aging signatures across tissues",
    format: "bulk",
    species: "Homo sapiens",
    assay: "RNA-seq · young 20–29 vs old 60–69",
    groupBy: "tissue",
    cohorts: [
      { id: "blood",   label: "Blood",   n: 48, up: 71, down: 0,  total: 71 },
      { id: "brain",   label: "Brain",   n: 52, up: 10, down: 53, total: 63 },
      { id: "liver",   label: "Liver",   n: 34, up: 0,  down: 99, total: 99 },
      { id: "heart",   label: "Heart",   n: 40, up: 3,  down: 10, total: 13 },
      { id: "muscle",  label: "Muscle",  n: 44, up: 0,  down: 9,  total: 9  },
    ],
  },
  {
    id: "motrpac",
    source: "MoTrPAC",
    title: "Endurance training · rats",
    format: "bulk",
    species: "Rattus norvegicus",
    assay: "RNA-seq time course (1W / 2W / 4W / 8W)",
    groupBy: "tissue × timepoint",
    cohorts: [
      { id: "bat_8w",    label: "BAT · 8W",     n: 6, up: 195, down: 90,  total: 285 },
      { id: "heart_4w",  label: "Heart · 4W",   n: 6, up: 0,   down: 110, total: 110 },
      { id: "heart_1w",  label: "Heart · 1W",   n: 6, up: 43,  down: 0,   total: 43  },
      { id: "gastroc_1w",label: "Gastroc · 1W", n: 6, up: 13,  down: 23,  total: 36 },
      { id: "blood_8w",  label: "Blood · 8W",   n: 6, up: 42,  down: 0,   total: 42 },
    ],
  },
  {
    id: "user_scrna",
    source: "Uploaded · scRNA-seq (demo)",
    title: "PBMC atlas · COVID vs healthy",
    format: "scRNA",
    species: "Homo sapiens",
    assay: "10x 3' v3 · 68,412 cells",
    groupBy: "cell type × condition",
    cohorts: [
      { id: "cd4_covid", label: "CD4 T · COVID vs Healthy",    n: 12412, up: 318, down: 204, total: 522 },
      { id: "cd8_covid", label: "CD8 T · COVID vs Healthy",    n: 9018,  up: 402, down: 181, total: 583 },
      { id: "mono_covid",label: "Monocyte · COVID vs Healthy", n: 14220, up: 511, down: 88,  total: 599 },
      { id: "nk_covid",  label: "NK · COVID vs Healthy",       n: 3901,  up: 144, down: 76,  total: 220 },
      { id: "b_covid",   label: "B cell · COVID vs Healthy",   n: 7655,  up: 88,  down: 162, total: 250 },
    ],
  },
];

// Precomputed GO embeddings the user can pick from.
window.MM_EMBEDDINGS = [
  { id: "gobert_umap", label: "GoBERT · UMAP",        dim: "1024→2", note: "default · semantic (LLM of GO)" },
  { id: "gobert_tsne", label: "GoBERT · t-SNE",       dim: "1024→2", note: "tighter local clusters" },
  { id: "go2vec_umap", label: "GO2Vec · UMAP",        dim: "300→2",  note: "graph-based, faster" },
  { id: "anc_umap",    label: "Ancestor co-member · UMAP", dim: "GO-graph→2", note: "pure topology, no LLM" },
  { id: "pca",         label: "PCA of gene signatures", dim: "n→2",    note: "data-driven, per run" },
];

window.MM_LIBRARIES = [
  { id: "go_bp_2025",  label: "GO Biological Process 2025", terms: 5343, genes: 14674, def: true },
  { id: "go_bp_2024",  label: "GO Biological Process 2024", terms: 5213, genes: 14501 },
  { id: "go_mf_2025",  label: "GO Molecular Function 2025", terms: 1738, genes: 13092 },
  { id: "go_cc_2025",  label: "GO Cellular Component 2025", terms: 1104, genes: 14002 },
  { id: "reactome",    label: "Reactome 2024",              terms: 2587, genes: 11345 },
  { id: "kegg",        label: "KEGG 2023 Human",            terms: 320,  genes: 8074 },
];

// Example gene lists (exactly as in the manuscript's custom-input screenshot).
window.MM_EXAMPLE = {
  up: "ATP6V0B, BANF1, BSG, BST2, BZW1, C14orf2, C19orf43, CALM1, CALM3, CALR, CAP1, CCND3, CCT3",
  down: "CCT6A, CCT7, CCT8, CD53, CD63, CFL1, CKB, CKS1B, CLIC1, CMTM6, CNN2",
};
