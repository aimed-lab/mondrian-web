# Mondrian Map - Real Data Pipeline Implementation Plan

**Project:** Mondrian Map v2.0 - Real Data Processing & CFDE Case Studies
**Date:** March 26, 2026
**Status:** Planning Phase
**Author:** Claude + Fuad

---

## Executive Summary

Transform Mondrian Map from a synthetic-data visualization tool into a production-grade bioinformatics analysis platform that processes real gene expression data through an enrichment → embedding → layout → visualization pipeline. This enables high-impact scientific papers demonstrating Mondrian Map's efficacy on real-world CFDE case studies.

---

## Phase 1: Architecture Overview

### Current State → Target State

**Current (Synthetic):**
```
Manual Entity Definition → Synthetic Data Gen → Visualization
```

**Target (Real Data):**
```
Gene Set (CSV)
  ↓ enrichment (gseapy)
GO Terms + Stats
  ↓ GoBERT embeddings
Embedded Vectors
  ↓ UMAP dimensionality reduction
(x, y) coordinates
  ↓ canvas scaling (1000×1000)
Positioned GO Terms
  ↓ significance-based sizing (-log10 p-value)
  ↓ direction-based coloring (up/down/shared)
  ↓ Jaccard Index crosstalk edges
Layout JSON
  ↓ Web App Rendering
Interactive Mondrian Visualization
```

### Key Components

1. **Backend Python Pipeline** (NEW)
   - Enrichment analysis engine
   - GoBERT embedding extractor
   - UMAP layout calculator
   - Canvas mapper

2. **Updated Web App**
   - Support new JSON data schema
   - Interactive slider controls (5 parameters)
   - Gene set uploader
   - Real-time filtering and rendering

---

## Phase 2: Python Data Processing Pipeline

### 2.1 Environment Setup

**Dependencies:**
```
gseapy>=1.0.1              # Enrichment analysis
torch>=2.0.0               # GoBERT embeddings
transformers>=4.30.0       # Model loading
huggingface-hub>=0.16.0    # Model downloads
umap-learn>=0.5.3          # Dimensionality reduction
scikit-learn>=1.3.0        # Utilities
pandas>=2.0.0              # Data handling
numpy>=1.24.0              # Numerical operations
```

**Installation:**
```bash
pip install gseapy torch transformers huggingface-hub umap-learn scikit-learn pandas numpy
```

### 2.2 Core Pipeline Modules

#### Module 1: Enrichment Analysis (`enrichment.py`)

**Function:** `run_enrichment(gene_list, library="GO_Biological_Process_2023", cutoff=0.05)`

**Input:**
- `gene_list` (list[str]): Gene symbols (e.g., ["TP53", "BRCA1", ...])
- `library` (str): Enrichr gene set library
- `cutoff` (float): p-value cutoff (default 0.05)

**Output:**
```python
{
  "go_id": "0006955",           # GO term ID (no "GO:" prefix)
  "go_name": "Immune Response",  # Human-readable name
  "p_value": 0.001,             # Raw p-value
  "adjusted_p_value": 0.0015,   # FDR-corrected
  "gene_count": 45,             # Number of overlapping genes
  "genes": ["GENE1", "GENE2", ...],  # List of matched genes
  "odds_ratio": 3.2,            # Statistical effect size
}
```

**Implementation Notes:**
- Filter results where `adjusted_p_value < cutoff`
- Skip if `len(gene_list) < 5`
- Return empty DataFrame if enrichment fails
- Use Benjamini-Hochberg FDR correction

#### Module 2: GoBERT Embedding Extraction (`gobert_embeddings.py`)

**Function:** `get_gobert_embeddings(go_ids)`

**Input:**
- `go_ids` (list[str]): GO term IDs without prefix (e.g., ["0006955", "0002250"])

**Output:**
```python
{
  "0006955": array([0.123, -0.456, 0.789, ...]),  # 768-dim vector
  "0002250": array([...]),
  ...
}
```

**Implementation Details:**
- Model: `MM-YY-WW/GoBERT` (HuggingFace)
- Download vocab.txt from HuggingFace hub
- Build token→ID mapping
- Tokenize GO terms to IDs
- Extract embeddings from last hidden layer
- Handle missing vocab terms gracefully (fallback: random embedding)

**Fallback Strategy:**
- If GO term not in vocab: use uniform random 768-dim vector
- If GoBERT unavailable: use PCA-reduced significance scores
- Log warnings for skipped terms

#### Module 3: UMAP Layout (`umap_layout.py`)

**Function:** `compute_umap_layout(embeddings_dict, n_neighbors=15, min_dist=0.1)`

**Input:**
- `embeddings_dict` (dict[str, ndarray]): GO ID → embedding vector
- `n_neighbors` (int): UMAP local connectivity (default 15)
- `min_dist` (float): Minimum distance between points (default 0.1)

**Output:**
```python
{
  "0006955": {"x": 0.456, "y": -0.234},  # Normalized to [-1, 1]
  "0002250": {"x": 0.123, "y": 0.789},
  ...
}
```

**Process:**
1. Stack embeddings into matrix (n_terms × 768)
2. Initialize UMAP with reduced 2D space
3. Fit and transform to (n_terms × 2)
4. Normalize to [-1, 1] range
5. Return as dict keyed by GO ID

**Parameters:**
- `n_neighbors=15`: Balance local/global structure
- `min_dist=0.1`: Prevent crowding
- `metric='cosine'`: Semantic similarity
- `random_state=42`: Reproducibility

#### Module 4: Canvas Scaling (`canvas_mapper.py`)

**Function:** `scale_to_canvas(coords_dict, canvas_width=1000, canvas_height=1000, padding=50)`

**Input:**
- `coords_dict` (dict[str, {"x": float, "y": float}]): Normalized [-1, 1] coordinates
- `canvas_width`, `canvas_height` (int): Target canvas size
- `padding` (int): Border padding (default 50)

**Output:**
```python
{
  "0006955": {"x": 234, "y": 567},  # Pixels [padding, width-padding]
  ...
}
```

**Process:**
1. Shift and scale from [-1, 1] to [0, canvas_width]
2. Apply padding: `x_pixel = (x_norm + 1) / 2 * (width - 2*padding) + padding`
3. Snap to 10px grid: `x_snapped = round(x_pixel / 10) * 10`
4. Clamp to bounds

### 2.3 Size & Color Calculation

#### Significance Scoring: `calculate_sizes(enrichment_results)`

**Size = Area of Rectangle:**
- Base formula: `area = -log10(adjusted_p_value) * scale_factor`
- Minimum area: 100 pixels (10×10 rect)
- Maximum area: 10,000 pixels (100×100 rect)
- Shape: square (width = height = sqrt(area))
- Grid alignment: snap to 10px

**Formula:**
```python
significance = -np.log10(adjusted_p_value)
area = max(100, min(10000, significance * 500))  # 500 = scale factor
width = height = int(np.sqrt(area))
width = snap_to_grid(width, 10)  # Mondrian grid
```

#### Color Assignment: `assign_colors(enrichment_results, fold_changes)`

**Logic:**
- Input: enrichment results + optional fold change data
- **Red (#E30022):** Upregulated (mean_log2fc > 0 OR direction="upregulated")
- **Blue (#0078BF):** Downregulated (mean_log2fc < 0 OR direction="downregulated")
- **Yellow (#FFD700):** Shared (intersection of up & down genes OR direction="shared")

**Implementation:**
```python
def assign_color(direction):
    color_map = {
        "upregulated": "#E30022",     # Red
        "downregulated": "#0078BF",   # Blue
        "shared": "#FFD700",          # Yellow
    }
    return color_map.get(direction, "#1D1D1D")  # Black (unknown)
```

### 2.4 Edge/Crosstalk Calculation

**Function:** `calculate_crosstalk(enrichment_results, jaccard_threshold=0.15)`

**Process:**
1. For each GO term pair:
   - Extract gene lists from enrichment results
   - Calculate Jaccard Index: `J = |A ∩ B| / |A ∪ B|`
2. Threshold: keep edges where `J > 0.15`
3. Sort edges by Jaccard value (descending)

**Output:**
```python
[
  {
    "source": "0006955",
    "target": "0002250",
    "weight": 0.75,        # Jaccard Index
    "type": "gene_overlap"
  },
  ...
]
```

### 2.5 Hierarchy Lookup

**Function:** `lookup_go_hierarchy(go_ids, go_layers_file="asset/GO_layers.txt")`

**Input:**
- `go_ids` (list[str]): GO term IDs
- `go_layers_file` (str): Path to GO_layers.txt

**Output:**
```python
{
  "0006955": {
    "name": "Immune Response",
    "layer": 1,           # Semantic granularity (1-13)
    "level": 5,           # Hierarchy depth (2-8)
    "size": 234,          # Number of annotated genes
  },
  ...
}
```

**Process:**
1. Load GO_layers.txt as DataFrame (tab-separated)
2. Index by GO ID (column: "ID" or "GOID")
3. Lookup each GO term → return layer, level, name, size

---

## Phase 3: Data Schema & Output Format

### 3.1 Input Format: Gene Set CSV

**File:** `genes.csv`
**Format:** Simple CSV with one gene per line

```csv
gene_symbol
TP53
BRCA1
EGFR
MYC
...
```

**Validation:**
- Minimum 5 genes
- Valid HGNC symbols (human genes)
- Case-insensitive (normalize to uppercase)

### 3.2 Output Format: Mondrian Layout JSON

**File:** `mondrian_layout.json`
**Schema:**

```json
{
  "metadata": {
    "case_study": "Case Study Name",
    "tissue_or_cell": "Tissue/Cell Type",
    "contrast": "Condition A vs Condition B",
    "input_gene_count": 150,
    "enriched_go_terms": 42,
    "significant_go_terms": 28,
    "generated_at": "2026-03-26T14:30:00Z"
  },
  "nodes": [
    {
      "go_id": "0006955",
      "name": "Immune Response",
      "direction": "upregulated",
      "significance_score": 4.52,
      "adjusted_p_value": 3.02e-5,
      "gene_count": 45,
      "genes": ["TP53", "BRCA1", ...],
      "continuous_coords": {"x": 12.4, "y": -3.2},
      "grid_coords": {"x": 240, "y": 500, "w": 40, "h": 40},
      "layer": 3,
      "color": "#E30022"
    },
    ...
  ],
  "edges": [
    {
      "source": "0006955",
      "target": "0002250",
      "weight": 0.85,
      "type": "gene_overlap"
    },
    ...
  ]
}
```

**Field Definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `go_id` | string | GO term identifier (no "GO:" prefix) |
| `name` | string | Human-readable GO term name |
| `direction` | enum | "upregulated" \| "downregulated" \| "shared" |
| `significance_score` | number | -log10(adjusted_p_value) |
| `adjusted_p_value` | number | FDR-corrected p-value |
| `gene_count` | integer | Number of overlapping genes |
| `genes` | array[string] | List of overlapping gene symbols |
| `continuous_coords` | {x, y} | UMAP coordinates (normalized) |
| `grid_coords` | {x, y, w, h} | Canvas pixels + dimensions |
| `layer` | integer | GO hierarchy layer (1-13) |
| `color` | string | Hex color code |
| `weight` | number | Jaccard Index (0-1) |

---

## Phase 4: Web App Updates

### 4.1 New Components

#### GeneSetUploader.jsx (NEW)

**Replaces:** DataUploader.jsx (or extends it)

**Features:**
- Upload CSV with gene symbols (one per line)
- Paste genes directly (textarea)
- Validate minimum 5 genes
- Show upload progress
- Display enrichment status

**State:**
```javascript
{
  genes: [],
  isLoading: false,
  error: null,
  progress: 0,
}
```

#### ParameterControls.jsx (NEW)

**Interactive Sliders for Dynamic Filtering:**

```javascript
{
  blockSize: {
    label: "Block Size",
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.0,
    tooltip: "Multiply block dimensions by this factor"
  },
  blockSpacing: {
    label: "Block Spacing",
    min: 0,
    max: 20,
    step: 1,
    default: 5,
    tooltip: "Pixels between blocks (grid spacing)"
  },
  maxBlocks: {
    label: "# Blocks to Show",
    min: 5,
    max: 100,
    step: 5,
    default: 50,
    tooltip: "Filter to top N blocks by significance"
  },
  maxEdges: {
    label: "# Edges to Show",
    min: 0,
    max: 500,
    step: 10,
    default: 100,
    tooltip: "Filter to top N edges by Jaccard Index"
  },
  minJaccardThreshold: {
    label: "Min Jaccard Similarity",
    min: 0,
    max: 1.0,
    step: 0.05,
    default: 0.15,
    tooltip: "Only show edges with Jaccard > threshold"
  },
  selectedLayer: {
    label: "GO Hierarchy Layer",
    min: 1,
    max: 13,
    step: 1,
    default: 1,
    tooltip: "Show only GO terms at this hierarchy level"
  }
}
```

**Behavior:**
- All sliders update state in real-time
- Debounce updates (100ms) for performance
- Display current value next to slider
- Reset to defaults button

#### RealDataTable.jsx (NEW)

**Displays:**
- Metadata (case study, tissue, contrast)
- Nodes table (sortable by significance, gene count, etc.)
- Edges table (sortable by Jaccard Index)
- Statistics panel (# GO terms, # edges, # shared genes)

### 4.2 Updated App.jsx

**New State:**
```javascript
const [dataSource, setDataSource] = useState('synthetic'); // 'synthetic' | 'real'
const [layoutJson, setLayoutJson] = useState(null);
const [parameters, setParameters] = useState({
  blockSize: 1.0,
  blockSpacing: 5,
  maxBlocks: 50,
  maxEdges: 100,
  minJaccardThreshold: 0.15,
  selectedLayer: 1,
});

// Computed filtered data based on parameters
const [filteredNodes, setFilteredNodes] = useState([]);
const [filteredEdges, setFilteredEdges] = useState([]);
```

**New Functions:**
```javascript
const handleGeneSetUpload = async (genes) => {
  // Call Python backend pipeline
  // Get layoutJson back
  // Update state
};

const handleParametersChange = (newParams) => {
  // Filter nodes/edges based on sliders
  // Update visualizations
};
```

### 4.3 Updated MondrianMap.jsx

**New Rendering Logic:**

```javascript
// Filter nodes by layer
const nodesForLayer = filteredNodes.filter(n => n.layer === selectedLayer);

// Apply blockSize multiplier
const scaledDimensions = nodesForLayer.map(n => ({
  ...n,
  width: n.grid_coords.w * parameters.blockSize,
  height: n.grid_coords.h * parameters.blockSize,
}));

// Apply spacing adjustment
const spacedCoords = adjustSpacing(scaledDimensions, parameters.blockSpacing);

// Filter edges
const edgesForLayer = filteredEdges.filter(e => {
  const source = nodesForLayer.find(n => n.go_id === e.source);
  const target = nodesForLayer.find(n => n.go_id === e.target);
  return source && target && e.weight >= parameters.minJaccardThreshold;
}).slice(0, parameters.maxEdges);
```

---

## Phase 5: Implementation Sequence

### Step 1: Backend Python Pipeline (Week 1)
- [ ] Create `python/enrichment.py`
- [ ] Create `python/gobert_embeddings.py`
- [ ] Create `python/umap_layout.py`
- [ ] Create `python/canvas_mapper.py`
- [ ] Create `python/process_pipeline.py` (orchestrator)
- [ ] Create `python/requirements.txt`
- [ ] Test with sample gene set (e.g., 150 genes)

### Step 2: Frontend Data Schema (Week 1-2)
- [ ] Update `App.jsx` state structure
- [ ] Create `GeneSetUploader.jsx`
- [ ] Create `RealDataTable.jsx`
- [ ] Update `MondrianMap.jsx` to accept real data schema

### Step 3: Interactive Controls (Week 2)
- [ ] Create `ParameterControls.jsx`
- [ ] Implement filtering logic in `App.jsx`
- [ ] Add debounced updates to visualization
- [ ] Test slider responsiveness

### Step 4: Integration (Week 2-3)
- [ ] Connect Python backend to web app (Flask API or CLI)
- [ ] End-to-end testing with real gene set
- [ ] Performance optimization (large datasets)
- [ ] Error handling & validation

### Step 5: Testing & Documentation (Week 3-4)
- [ ] Unit tests for Python pipeline
- [ ] Integration tests for web app
- [ ] Load testing with 100+ GO terms
- [ ] Document API for case studies
- [ ] Create example case studies

---

## Phase 6: Python Backend Options

### Option A: Flask REST API (Recommended for production)
```
POST /api/process
{
  "genes": ["TP53", "BRCA1", ...],
  "case_study": "...",
  "tissue": "..."
}

Response: layoutJson
```

**Pros:** Scalable, decoupled, easy deployment
**Cons:** Requires server setup

### Option B: CLI Script (Good for development)
```bash
python process_pipeline.py \
  --genes genes.csv \
  --case-study "Case Name" \
  --output layout.json
```

**Pros:** Simple, no server needed
**Cons:** Less flexible for real-time updates

### Option C: Node.js Wrapper (Hybrid)
Use Python CLI wrapped in Node.js express server

---

## Phase 7: Testing Strategy

### Unit Tests (Python)
- Enrichment: verify GO term selection
- GoBERT: test embedding dimensions
- UMAP: test coordinate ranges
- Canvas: test scaling and snapping
- Colors: test direction assignment

### Integration Tests (Web)
- Upload gene set → verify layout generated
- Move sliders → verify filtered data updates
- Layer selection → verify node filtering
- Edge export → verify JSON structure

### End-to-End Tests
- Sample datasets (5, 50, 100+ genes)
- Real CFDE case studies (when available)
- Performance benchmarks
- Large visualization stress tests

---

## Phase 8: Deliverables

### Code
- [ ] `python/` directory with full pipeline
- [ ] Updated React components
- [ ] API documentation
- [ ] Configuration files (requirements.txt, .env)

### Documentation
- [ ] API specification
- [ ] User guide for case studies
- [ ] Installation & setup instructions
- [ ] Example: "How to run a CFDE case study"

### Examples
- [ ] Sample gene sets
- [ ] Sample output JSON
- [ ] Case study templates

---

## Key Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Python backend | Leverages mature bioinformatics libraries (gseapy, torch, umap) |
| GoBERT embeddings | Semantic understanding of GO terms (vs. random) |
| UMAP for layout | Preserves both local & global structure better than t-SNE |
| 10px grid snapping | Maintains Mondrian aesthetic consistency |
| Jaccard Index for edges | Biologically meaningful measure of pathway overlap |
| Slider-based filtering | Real-time interactive exploration without re-computing |
| -log10(p-value) for size | Standard in bioinformatics; intuitive magnitude scaling |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| GoBERT model unavailable | Fallback to PCA-reduced significance scores |
| Slow enrichment | Cache results, support async processing |
| Large datasets (100+ GO) | Implement pagination, lazy loading |
| Memory issues on canvas | Render layers separately, limit simultaneous rendering |
| Missing gene symbols | Validation & error messages, fuzzy matching option |

---

## Success Criteria

- [ ] Process real gene set → GO terms + stats in <5 min
- [ ] Visualization renders 50+ nodes smoothly
- [ ] Sliders update view in <500ms
- [ ] Export SVG at publication quality
- [ ] Support 13 GO hierarchy layers
- [ ] All 5 parameters controllable and interactive
- [ ] Full automation ready for case studies

---

## Timeline

- **Week 1:** Python pipeline complete & tested
- **Week 2:** Frontend components & integration
- **Week 3:** Optimization & case study prep
- **Week 4:** Documentation & rollout

---

## Notes for Fuad

This plan provides a complete roadmap to transform Mondrian Map into a production platform for real bioinformatics data. The architecture is modular—each component (enrichment, embeddings, layout, rendering) can be developed and tested independently.

Once this foundation is solid, the case studies will plug in seamlessly: upload genes → get visualization → explore interactively → publish results.

Let me know which phase to start with first!

