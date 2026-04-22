# Release notes

## 2026-04-22 — UI redesign: Claude Design handoff ported to ESM React

The Mondrian Map UI is being redesigned from a Tailwind sidebar layout to a Google-Maps-style floating-chrome interface. Work is staged across three branches so the deployed app stays stable while the redesign matures.

### Branch map

| Branch | Role | Notes |
|---|---|---|
| `main` | Production. Deployed to [mondrianmap.smartdrugdiscovery.org](https://mondrianmap.smartdrugdiscovery.org/). Untouched by the redesign. | Tailwind sidebar app. |
| `design-preview` | Raw Claude Design handoff, preserved verbatim. | UMD React + in-browser Babel at `public/design/Mondrian Map.html`. Mock data. Non-production. Read-only reference for pixel fidelity. |
| `design-port` | ESM React port of the handoff, wired to the real offline enrichment pipeline. | The in-progress next-generation UI. `main` unchanged; all additions in `src/design/` + a rewrite of `src/App.jsx`. |

### What landed on `design-port`

New in [`src/design/`](src/design/):
- [`theme.css`](src/design/theme.css) — handoff CSS. Prototype's `.br-cluster` / `.bl-cluster` `z-index` raised from 30 → 36 so the LayerPopup / LegendPopup can paint over the DetailDrawer (a stacking-context bug latent in the prototype).
- [`layout.js`](src/design/layout.js) — pure `mmLayout` guillotine partitioner, label placement, edge routing.
- [`MondrianCanvas.jsx`](src/design/MondrianCanvas.jsx) — `MondrianPlate` (SVG renderer) + `MapSurface` (pan/zoom controller, wheel/keyboard shortcuts).
- [`MapUI.jsx`](src/design/MapUI.jsx) — `SearchPill`, `TopRightCluster`, `MapControls` (GOALS pyramid `LayerPopup`, compass, zoom stack), `MapLegend`.
- [`Drawers.jsx`](src/design/Drawers.jsx) — `LeftDrawer` (gene-set input wired to `onRunAnalysis`, filters wired to `parameters`, GO-term table) + `DetailDrawer` (AI Insights / Genes / Similar tabs).
- [`Modals.jsx`](src/design/Modals.jsx) — `ImportModal`, `LoginModal` stubs.
- [`Icon.jsx`](src/design/Icon.jsx) — inline Lucide-style icon set.

Wiring preserved from the prior `App.jsx`:
- Offline-first enrichment pipeline (`runOfflinePipeline`) with Flask backend fallback via `/api/process`.
- GO hierarchy fetch from `/data/go_hierarchy.json`.
- `parameters` state (`pValueCutoff`, `jaccardThreshold`, `selectedLayer`, etc.).
- Library index via `utils/offlinePipeline.loadLibraryIndex`.

Data bridge at `src/App.jsx:bridgeLayoutToDesign` maps real pipeline output → design-shaped `{ terms, edges }` with `−log₁₀p`, `dir ∈ {−1, 0, +1}`, and `grid_coords` normalized to `[0.05, 0.95]` in plate coordinates.

### Verified end-to-end (via the live offline pipeline)

- Gene-set input → enrichment → real GO terms render as Mondrian blocks.
- Block click → DetailDrawer opens with real GO ID, −log₁₀p, n, hub genes.
- LayerPopup GOALS pyramid, MapLegend popup, pan/zoom/wheel/keyboard shortcuts all operational.
- No console errors or warnings on load.

### Known gaps / next steps

Ordered by how much the missing feature blocks real use:

1. **Rewire drug-perturbation Case Studies picker.** The `Case Studies` tab in the new `LeftDrawer` is a placeholder. The working LINCS / GTEx / MoTrPAC picker lives in [`src/components/GeneSetInput.jsx`](src/components/GeneSetInput.jsx) on `main` (see `CaseStudyPanel`, `selectedDb`, `selectedDrug`). Either embed that component inside the new drawer, or port its logic into a design-styled panel.
2. **Rewire AI Insights narratives.** The `AI Insights` tab currently renders a templated string. The real narrative generator calls `/.netlify/functions/ai-explain` — handler at [`src/api/handlers/aiExplain.js`](src/api/handlers/aiExplain.js), client wrapper in [`src/components/AIExplainPanel.jsx`](src/components/AIExplainPanel.jsx), prompt builder in [`src/utils/promptBuilder.js`](src/utils/promptBuilder.js). Replace the templated body in `Drawers.jsx:AIInsightPanel`.
3. **Wire the Upload tab.** `ImportModal` in `src/design/Modals.jsx` is a 3-step stub. The real upload flow needs to land on the same `layoutJson` shape that `runOfflinePipeline` returns. Existing uploader at [`src/components/DataUploader.jsx`](src/components/DataUploader.jsx).
4. **Restore ZIP / SVG / PNG export.** Old App's `handleDownloadAllLayersZip`, the per-layer PNG download, and the selection-only SVG export (`mondrianMapRef.current.getSVG(...)`) are all gone from the new shell. Re-attach inside the drawer's `ExportMenu`, using [`src/utils/imageExport.js`](src/utils/imageExport.js) (`svgToPngBlob`) and `jszip`. The new `MondrianPlate` will need to expose a similar imperative `getSVG()` method, or the export flow needs to serialize the rendered SVG directly from the DOM.
5. **Wire the Similar tab.** Currently a placeholder. No prior implementation to port — design calls for rummageGEO / rummaGENE queries; write fresh clients or leave deferred.
6. **Hierarchical Term Projection toggle.** The `carryParentNodes` / ghost-parent logic in the old `mapRealDataToEntities` is not invoked by `bridgeLayoutToDesign`. If hierarchical projection matters, port the ghost-node pathway into the bridge.
7. **Animations / layer transitions.** The `framer-motion` zoom-in/zoom-out animation on layer change is not in the new App. Add back if desired.
8. **Filter: `minGenes`.** New filter in the design; applied client-side in `bridgeLayoutToDesign`. If authoritative gene-count filtering should happen upstream in the pipeline, push this into `runOfflinePipeline`.

### Getting started as a contributor

```bash
git checkout design-port
npm install --force    # macOS ARM: --force skips the pinned @rollup/rollup-linux-x64-gnu check
npm run dev            # http://localhost:5173
```

Recommended reading order for understanding the port:

1. [`src/App.jsx`](src/App.jsx) — top-level state, pipeline wiring, the `bridgeLayoutToDesign` function at the bottom.
2. [`src/design/MondrianCanvas.jsx`](src/design/MondrianCanvas.jsx) — how terms + edges become SVG.
3. [`src/design/Drawers.jsx`](src/design/Drawers.jsx) — left & right drawer panels; this is where most re-wiring work will land.
4. [`src/design/MapUI.jsx`](src/design/MapUI.jsx) — floating chrome (pill, zoom, layer popup, legend).
5. [`src/design/theme.css`](src/design/theme.css) — every class used above; one file.

When re-wiring a feature from `main`, the pattern is:
- Identify the component on `main` (e.g. `AIExplainPanel`).
- Read its props contract and the data shapes it consumes.
- Either import it directly into a drawer panel in `src/design/Drawers.jsx` (quickest, breaks visual fidelity) or rebuild the UI in design CSS while calling the same utility functions / API handlers (cleaner, more work).
- Keep `src/components/*` untouched — it's the reference implementation until every feature is rewired.

### Branch merge strategy (suggested, not decided)

- Keep `main` frozen except for production hotfixes until the `design-port` follow-ups land.
- When the above list hits parity, squash-merge `design-port` → `main`.
- Retain `design-preview` indefinitely as the pixel-perfect design reference; it costs nothing and disambiguates what "the design" means when implementation drifts.
