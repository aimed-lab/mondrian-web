<!-- <p align="center">
  <img src="figures/none.png" alt="MondrianMap" width="280"/>
</p> -->

<h1 align="center">MondrianMap</h1>

<p align="center">
  <strong>Navigating gene set hierarchies with multi-resolution maps</strong>
</p>

<p align="center">
  <a href="https://mondrianmap.smartdrugdiscovery.org/">🌐 Web Application</a> &nbsp;·&nbsp;
  <a href="#citation">📄 Cite</a> &nbsp;·&nbsp;
  <a href="#getting-started">⚙️ Getting Started</a>
</p>

---

## Overview

Gene set enrichment analysis translates differential expression into biological meaning, yet every conventional tool collapses the Gene Ontology's hierarchical structure into flat ranked lists. **MondrianMap** restores that hierarchy. It organizes enrichment results into **13 semantically principled layers** derived from the [GOALS](https://doi.org/10.1101/2025.04.22.650095) framework and renders them as color-encoded rectangular maps where:

- **Block area** encodes statistical significance (−log₁₀ adjusted p-value)
- **Color** encodes effect direction (red = upregulated, blue = downregulated)
- **Spatial proximity** preserves semantic relatedness (GoBERT + UMAP)
- **Layer navigation** enables multi-resolution traversal from molecular mechanism to system-level theme

MondrianMap integrates three NIH Common Fund Data Ecosystem (CFDE) databases — **LINCS L1000**, **GTEx Aging Signatures**, and **MoTrPAC** — as pre-indexed, searchable repositories, alongside support for custom gene list upload.

---

## Pipeline

<p align="center">
  <img src="figures/pipeline.png" alt="MondrianMap Pipeline" width="100%"/>
</p>

<p align="center"><em>Figure 1 — CFDE datasets or user-uploaded gene lists undergo enrichment analysis (Fisher's exact test, FDR ≤ 0.05). Enriched GO-BP terms are assigned to 13 GOALS semantic layers and embedded via GoBERT + UMAP for spatial layout. The resulting Mondrian maps encode significance (area), direction (color), and semantic proximity (position) within a navigable, layer-resolved interface.</em></p>

---

## Web Application

<p align="center">
  <img src="figures/webapp.png" alt="MondrianMap Interface" width="100%"/>
</p>

<p align="center"><em>Figure 2 — Interactive interface. <strong>(a)</strong> Gene set input (custom or CFDE case studies). <strong>(b)</strong> Layer-resolved Mondrian map canvas with zoomable drill-down. <strong>(c)</strong> Enrichment results panel with term statistics. <strong>(d–e)</strong> Dynamic filters for gene count, significance, and Jaccard crosstalk thresholds. <strong>(f–g)</strong> AI hypothesis generation module producing layer-grounded biological narratives.</em></p>

---

## Case Study: LINCS CRISPR Perturbations

<p align="center">
  <img src="figures/cs1.png" alt="LINCS Case Study" width="85%"/>
</p>

<p align="center"><em>Figure 3 — Layer-resolved Mondrian maps discriminate cancer driver mechanisms. <strong>(a–b)</strong> TP53 and KRAS knockouts at GOALS Layer 8: the same immune recruitment processes (neutrophil chemotaxis, granulocyte chemotaxis) appear as blue blocks in TP53 and red blocks in KRAS — a directional inversion visible at a glance. <strong>(c–e)</strong> Multi-resolution navigation within TP53 across Layers 4, 6, and 13 reveals three progressively broader biological narratives from a single enrichment. <strong>(f–g)</strong> Two independent TP53 replicates at Layer 7 confirm visual reproducibility.</em></p>

Two additional case studies — GTEx tissue-aging signatures and MoTrPAC exercise temporal dynamics — are presented in the accompanying manuscript.

---

## Getting Started

### Web Application (Recommended)

No installation required. Visit **[mondrianmap.smartdrugdiscovery.org](https://mondrianmap.smartdrugdiscovery.org/)** to analyze CFDE databases or upload custom gene lists.

### Local Development

**Frontend**
```bash
git clone https://github.com/aimed-lab/mondrian-web.git
cd mondrian-web
npm install
npm run dev
```

**Python Pipeline**
```bash
cd python
pip install -r requirements.txt
python process_pipeline.py --help
```

### Ingesting Custom Databases

```bash
python python/ingest_database.py <path_to_gmt> \
    --id <db_id> \
    --name <display_name> \
    --label-type <category_label> \
    --description <description>
```

| Flag | Description |
|---|---|
| `--id` | Short database identifier (e.g., `LINCS`) |
| `--name` | Display name in the web application dropdown |
| `--label-type` | Category label (e.g., `Drug Perturbation`) |
| `--shard-size` | Target shard size in MB (default: 5) |
| `--single-dir` | Treat all entries as unidirectional (no Up/Down pairing) |

---

## Citation

If you use MondrianMap in your research, please cite:

> **MondrianMap: Hierarchical Enrichment Visualization for Multi-Resolution Biological Discovery**
> Al Abir, F., Yue, Z., Saghapour, E., Hossain, M.D., Sembay, Z., Zhang, S., & Chen, J.Y. (2026). *(Under Review)*

> **Mondrian Abstraction and Language Model Embeddings for Differential Pathway Analysis**
> Al Abir, F. & Chen, J.Y. (2024). *IEEE International Conference on Bioinformatics and Biomedicine (BIBM)*.
> [DOI: 10.1101/2024.04.11.589093](https://doi.org/10.1101/2024.04.11.589093)

> **GOALS: Gene Ontology Analysis with Layered Shells for Enhanced Functional Insight and Visualization**
> Yue, Z., Welner, R.S., Willey, C.D., Amin, R., Li, Q., Chen, H., & Chen, J.Y. (2025).
> [DOI: 10.1101/2025.04.22.650095](https://doi.org/10.1101/2025.04.22.650095)

---

## Authors

Fuad Al Abir, Zongliang Yue, Ehsan Saghapour, Md Delower Hossain, Zhandos Sembay, Sixue Zhang, Jake Y. Chen

Correspondence: [jakechen@uab.edu](mailto:jakechen@uab.edu)

---

## License

MondrianMap is open-source. Source code is available at [github.com/aimed-lab/mondrian-web](https://github.com/aimed-lab/mondrian-web).
