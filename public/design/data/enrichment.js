// A handcrafted but believable enrichment result.
// Each term has: id, name, layer, logp, nGenes, dir (+1/-1/0), hub genes.
// Layout coordinates are synthesized; the Mondrian renderer below uses them
// to build a treemap-style nested rectangle plot.

window.MM_TERMS = [
  // ---- Layer 4 (specific metabolic) ----
  { id:"GO:0017144", name:"Daunorubicin Metabolic Process",     layer:4, logp:4.11, n:6,  dir:-1, genes:["AKR1C1","AKR1C2","AKR1C3","AKR1B10"] },
  { id:"GO:0044597", name:"Doxorubicin Metabolic Process",      layer:4, logp:3.88, n:5,  dir:-1, genes:["AKR1C1","AKR1C2","AKR1C3"] },
  { id:"GO:0030194", name:"Positive Reg. of Blood Coagulation", layer:4, logp:3.52, n:6,  dir:-1, genes:["FGA","FGB","FGG"] },
  { id:"GO:0034382", name:"VLDL Particle Assembly",             layer:4, logp:2.79, n:4,  dir:-1, genes:["APOB","MTTP","APOA2"] },
  { id:"GO:0031639", name:"Plasminogen Activation",             layer:4, logp:2.63, n:4,  dir:-1, genes:["PLAT","PLAU","SERPINE1"] },
  { id:"GO:0030195", name:"Zymogen Activation",                 layer:4, logp:2.11, n:3,  dir:-1, genes:["F2","F10","KLK3"] },

  // ---- Layer 5 (what the reference screenshot shows) ----
  { id:"GO:1904352", name:"Positive Regulation of Telomerase RNA Localization to Cajal Body", layer:5, logp:5.41, n:3, dir:0, genes:["TCAB1","COIL","NOP10"] },
  { id:"GO:1904353", name:"Regulation of Protein Localization to Cajal Body",                 layer:5, logp:5.30, n:3, dir:0, genes:["COIL","SMN1","WRAP53"] },
  { id:"GO:1904354", name:"Positive Regulation of Protein Localization to Cajal Body",        layer:5, logp:4.95, n:3, dir:0, genes:["COIL","WRAP53","DKC1"] },
  { id:"GO:1902275", name:"Chaperone Mediated Protein Folding Independent of Cofactor",       layer:5, logp:3.12, n:4, dir:0, genes:["HSPA8","HSPA1A","DNAJB1"] },
  { id:"GO:1903799", name:"Regulation of Establishment of Protein Localization to Telomere",  layer:5, logp:2.52, n:2, dir:-1, genes:["TERT","DKC1"] },
  { id:"GO:0048525", name:"Negative Regulation of Viral Life Cycle",                          layer:5, logp:2.78, n:4, dir:+1, genes:["BST2","IFIT1","OAS1"] },
  { id:"GO:0061844", name:"Antimicrobial Humoral Immune Response Mediated by Antimicrobial Peptide", layer:5, logp:2.66, n:3, dir:+1, genes:["DEFB1","LTF","S100A8"] },
  { id:"GO:0032414", name:"Organellar Lumen Acidification",                                   layer:5, logp:2.42, n:3, dir:+1, genes:["ATP6V0B","ATP6V1A","CLCN5"] },
  { id:"GO:0051605", name:"Endosomal Lumen Acidification",                                    layer:5, logp:2.31, n:3, dir:+1, genes:["ATP6V0B","ATP6V1A"] },
  { id:"GO:0002486", name:"Peptide Antigen Assembly with MHC Class I Protein Complex",        layer:5, logp:2.15, n:2, dir:+1, genes:["TAP1","TAP2","HLA-B"] },
  { id:"GO:0000281", name:"Mitotic Nuclear Membrane Reassembly",                              layer:5, logp:2.60, n:3, dir:+1, genes:["LBR","BAF","BANF1"] },
  { id:"GO:0030866", name:"Mitotic Nuclear Membrane Organization",                            layer:5, logp:2.47, n:3, dir:+1, genes:["LBR","BAF"] },
  { id:"GO:1990733", name:"Mitochondrion–Endoplasmic Reticulum Membrane Tethering",           layer:5, logp:2.40, n:3, dir:+1, genes:["PTPIP51","VAPB"] },
  { id:"GO:0034262", name:"Autophagosome Membrane Docking",                                   layer:5, logp:2.21, n:2, dir:+1, genes:["STX17","SNAP29"] },

  // ---- Layer 7 (intermediate immune, inflammaging) ----
  { id:"GO:0019730", name:"Antimicrobial Humoral Response",          layer:7, logp:4.96, n:14, dir:+1, genes:["DEFA1","LTF","S100A9","CXCL8"] },
  { id:"GO:0030195b",name:"Negative Regulation of Blood Coagulation",layer:7, logp:4.59, n:8,  dir:+1, genes:["FGA","FGB","FGG"] },
  { id:"GO:0042742", name:"Defense Response to Bacterium",           layer:7, logp:3.21, n:11, dir:+1, genes:["DEFB1","S100A8","S100A9"] },
  { id:"GO:0002274", name:"Myeloid Leukocyte Activation",            layer:7, logp:2.80, n:9,  dir:+1, genes:["CSF1R","CXCL8","IL1B"] },
  { id:"GO:0002252", name:"Monocyte Chemotaxis",                     layer:7, logp:2.44, n:6,  dir:-1, genes:["CCL2","CCL3","CCL4"] },

  // ---- Layer 8 (TP53/KRAS immune contrast) ----
  { id:"GO:0071621", name:"Granulocyte Chemotaxis",                  layer:8, logp:2.58, n:8, dir:-1, genes:["CXCL5","CXCL8","CCL2"] },
  { id:"GO:0030593", name:"Neutrophil Chemotaxis",                   layer:8, logp:1.54, n:5, dir:-1, genes:["CXCL8","CXCL5"] },
  { id:"GO:1990266", name:"Neutrophil Migration",                    layer:8, logp:1.42, n:5, dir:-1, genes:["CXCL8","S100A8"] },
  { id:"GO:0070098", name:"Chemokine-Mediated Signaling Pathway",    layer:8, logp:1.46, n:5, dir:-1, genes:["CXCL9","CXCL10","CCL2"] },
  { id:"GO:0030216", name:"Keratinocyte Differentiation",            layer:8, logp:3.54, n:8, dir:+1, genes:["KRT5","KRT14","SPRR1A"] },
  { id:"GO:0042127", name:"Regulation of Cholesterol Homeostasis",   layer:8, logp:2.03, n:5, dir:-1, genes:["APOA2","APOC1","LDLR"] },
  { id:"GO:0019216", name:"Regulation of Lipid Metabolic Process",   layer:8, logp:1.89, n:5, dir:-1, genes:["APOA2","APOC1","APOC3"] },
  { id:"GO:0043534", name:"Blood Vessel Endothelial Cell Migration", layer:8, logp:1.88, n:5, dir:+1, genes:["VEGFA","VEGFC","EFNB2"] },
  { id:"GO:0002040", name:"Sprouting Angiogenesis",                  layer:8, logp:1.39, n:6, dir:+1, genes:["VEGFA","GREM1"] },

  // ---- Layer 13 (umbrella) ----
  { id:"GO:0043065", name:"Positive Regulation of Apoptotic Process", layer:13, logp:1.23, n:15, dir:+1, genes:["XBP1","ATF4","DDIT3","CDKN2A"] },
  { id:"GO:0008284", name:"Positive Reg. of Cell Population Proliferation", layer:13, logp:1.29, n:20, dir:+1, genes:["MYC","CCND1","E2F1"] },
  { id:"GO:0006954", name:"Inflammatory Response",                    layer:13, logp:1.60, n:13, dir:-1, genes:["CXCL10","CXCL9","CCL2","IL6"] },
  { id:"GO:0045765", name:"Regulation of Angiogenesis",               layer:13, logp:1.48, n:11, dir:-1, genes:["VEGFA","STAT3","ANGPT1"] },
  { id:"GO:0019221", name:"Cytokine-Mediated Signaling Pathway",      layer:13, logp:1.35, n:10, dir:-1, genes:["CXCL10","IL6","STAT3"] },
  { id:"GO:0030155", name:"Regulation of Cell Adhesion",              layer:13, logp:1.22, n:9,  dir:-1, genes:["ICAM1","VCAM1","ITGA5"] },
];

// Precomputed 2D coordinates (UMAP-like) per term, for the chosen embedding.
// Generated to cluster functionally related terms loosely.
(function seed() {
  const rand = (s) => { let x = Math.sin(s) * 10000; return x - Math.floor(x); };
  const groups = {
    4:  { cx:0.28, cy:0.78, r:0.12 },   // metabolic — lower-left
    5:  { cx:0.45, cy:0.42, r:0.18 },   // cajal/chaperone — center
    7:  { cx:0.68, cy:0.30, r:0.12 },   // antimicrobial — upper-right
    8:  { cx:0.62, cy:0.62, r:0.14 },   // immune/angiogenic — right
    13: { cx:0.20, cy:0.28, r:0.14 },   // umbrella — upper-left
  };
  window.MM_TERMS.forEach((t, i) => {
    const g = groups[t.layer] || { cx:0.5, cy:0.5, r:0.1 };
    const a = rand(i + 1) * Math.PI * 2;
    const rr = Math.sqrt(rand(i + 2)) * g.r;
    t.x = g.cx + Math.cos(a) * rr;
    t.y = g.cy + Math.sin(a) * rr;
  });
})();

// Crosstalk edges (Jaccard-based in the paper).
// [termA, termB, weight 0..1] — weight maps to line thickness.
window.MM_EDGES = [
  // Cajal body cluster (yellow↔yellow = yellow lines)
  ["GO:1904352","GO:1904353",0.95],
  ["GO:1904353","GO:1904354",0.85],
  ["GO:1904352","GO:1904354",0.78],
  ["GO:1902275","GO:1904353",0.42],
  // Mitotic nuclear membrane (up↔up = red lines)
  ["GO:0030866","GO:0000281",0.62],
  ["GO:1990733","GO:0034262",0.48],
  ["GO:0000281","GO:1990733",0.40],
  // Acidification cluster
  ["GO:0032414","GO:0051605",0.88],
  ["GO:0051605","GO:0002486",0.35],
  // Antimicrobial / immune (up↔up)
  ["GO:0019730","GO:0042742",0.72],
  ["GO:0019730","GO:0061844",0.68],
  ["GO:0061844","GO:0042742",0.55],
  ["GO:0002274","GO:0019730",0.38],
  ["GO:0048525","GO:0019730",0.31],
  // Chemotaxis (down↔down = blue)
  ["GO:0030593","GO:1990266",0.81],
  ["GO:0030593","GO:0071621",0.66],
  ["GO:0070098","GO:0071621",0.45],
  ["GO:0070098","GO:0030593",0.40],
  // Angiogenesis (up↔up)
  ["GO:0002040","GO:0043534",0.58],
  // Lipid / cholesterol (down↔down)
  ["GO:0019216","GO:0042127",0.51],
  // Metabolism of xenobiotics (down↔down)
  ["GO:0017144","GO:0044597",0.88],
  ["GO:0030194","GO:0031639",0.32],
  ["GO:0034382","GO:0019216",0.28],
  // Cross-direction (mixed = yellow lines)
  ["GO:0043065","GO:0048525",0.24],
  ["GO:0006954","GO:0002274",0.30],
  ["GO:0019221","GO:0070098",0.48],
  ["GO:0045765","GO:0002040",0.42],
  ["GO:0030155","GO:0071621",0.28],
  ["GO:0008284","GO:0000281",0.22],
];
