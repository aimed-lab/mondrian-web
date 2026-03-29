/**
 * parseLINCSId.js
 *
 * Parses LINCS L1000 perturbation identifier strings into structured metadata.
 *
 * Format:  {plate}_{cellLine}_{duration}_{well}_{drug}_{concentration}
 * Examples:
 *   ABY001_A375_XH_A13_afatinib_10uM
 *   ABY001_A375_XH_A15_neratinib_10uM
 *   ABY001_A549_XH_D01_BEVACIZUMAB_0.25mg_per_ml
 *
 * The parser is also tolerant of leading prefixes from database exports, e.g.:
 *   LINCS_L1000_Antibody_Perturbation_Full_ABY001_A549_XH_D01_BEVACIZUMAB_0.25mg_per_ml
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert drug/gene names to human-friendly title case. */
function titleCase(str) {
  if (!str) return str;
  // All-caps abbreviations (≥3 chars or starts with digit) stay as-is
  if (/^[A-Z0-9\-]{3,}$/.test(str)) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a raw concentration token to a readable string.
 * "10uM"            → "10 µM"
 * "0.25mg_per_ml"   → "0.25 mg/mL"
 * "100nM"           → "100 nM"
 */
function humanizeConcentration(raw) {
  if (!raw) return '';
  return raw
    .replace(/per_ml/gi, '/mL')
    .replace(/per_ul/gi, '/µL')
    .replace(/per_l/gi,  '/L')
    .replace(/_/g, ' ')
    .replace(/(\d)(uM)\b/gi, '$1 µM')
    .replace(/(\d)(nM)\b/gi, '$1 nM')
    .replace(/(\d)(mg)\b/gi, '$1 mg')
    .replace(/(\d)(ug)\b/gi, '$1 µg')
    .trim();
}

/**
 * Returns true if a string looks like a well position (single letter + digits, e.g. A13, D01).
 */
function isWell(s) {
  return /^[A-Z]\d{1,2}$/.test(s);
}

/**
 * Returns true if a string looks like a treatment duration (e.g. XH, 6H, 24H, 48H).
 */
function isDuration(s) {
  return /^(\d+|X)H$/i.test(s);
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parses a LINCS case ID string (possibly with a prefix like
 * "LINCS_L1000_Antibody_Perturbation_Full_") into structured fields.
 *
 * @param {string} raw  – raw case ID or contrast string ("... vs Control")
 * @returns {{ plate, cellLine, duration, well, drug, concentration, drugDisplay, raw } | null}
 */
export function parseLINCSId(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Strip trailing " vs Control" (case-insensitive)
  let id = raw.replace(/\s+vs\s+control\s*$/i, '').trim();

  // Split on underscore
  let parts = id.split('_');

  // Find the plate-ID segment: all-caps letters followed by digits (e.g. ABY001, CPC006)
  const plateIdx = parts.findIndex(p => /^[A-Z]{2,}\d+$/.test(p));
  if (plateIdx === -1) return null;

  // Discard any prefix segments before the plate ID
  parts = parts.slice(plateIdx);

  // Expect at least: [plate, cellLine, duration, well, drug, ...concentration]
  if (parts.length < 5) return null;

  const plate    = parts[0];
  const cellLine = parts[1];

  // Detect duration and well — they can appear in slots 2 and 3 in either order
  let durationIdx = -1;
  let wellIdx     = -1;
  for (let i = 2; i <= 4 && i < parts.length; i++) {
    if (durationIdx === -1 && isDuration(parts[i])) { durationIdx = i; continue; }
    if (wellIdx     === -1 && isWell(parts[i]))     { wellIdx     = i; continue; }
  }
  // Fallback positions if patterns don't match (common format: 2=duration, 3=well)
  if (durationIdx === -1) durationIdx = 2;
  if (wellIdx     === -1) wellIdx     = 3;

  const duration = parts[durationIdx] ?? '';
  const well     = parts[wellIdx]     ?? '';

  // Everything after the well is drug [+ concentration]
  const afterWell = Math.max(durationIdx, wellIdx) + 1;
  const drug      = parts[afterWell] ?? '';
  const concRaw   = parts.slice(afterWell + 1).join('_');
  const concentration = humanizeConcentration(concRaw);

  // Humanize duration: XH → "unknown duration", 6H → "6 h"
  const durationDisplay = isDuration(duration)
    ? duration.toUpperCase() === 'XH'
      ? 'treatment'
      : duration.replace(/H$/i, ' h')
    : duration;

  return {
    plate,
    cellLine,
    duration,
    durationDisplay,
    well,
    drug,
    concentration,
    drugDisplay: titleCase(drug),
    raw: parts.join('_'),
  };
}

// ---------------------------------------------------------------------------
// Convenience: parse a contrast string ("case vs Control") into a sentence
// ---------------------------------------------------------------------------

/**
 * Generates a concise English description of the experimental condition.
 *
 * @param {string} contrast  – e.g. "ABY001_A549_XH_D01_BEVACIZUMAB_0.25mg_per_ml vs Control"
 * @returns {string}
 */
export function describeContrast(contrast) {
  if (!contrast) return contrast ?? '';
  const parsed = parseLINCSId(contrast);
  if (!parsed) return contrast;

  const { cellLine, drugDisplay, concentration, durationDisplay, well, plate } = parsed;

  const parts = [`${cellLine} cells`, `treated with ${drugDisplay}`];
  if (concentration) parts.push(`at ${concentration}`);
  if (durationDisplay && durationDisplay !== 'treatment') parts.push(`for ${durationDisplay}`);
  parts.push('vs. Control');

  return parts.join(' ');
}

/**
 * Generates a detailed context block for prompt injection.
 *
 * @param {string} contrast
 * @param {string|undefined} caseName
 * @returns {string}
 */
export function buildLINCSContext(contrast, caseName) {
  const parsed = parseLINCSId(contrast || caseName);
  if (!parsed) {
    // Fall back to the raw strings
    const lines = [];
    if (caseName)  lines.push(`Case study: ${caseName}`);
    if (contrast)  lines.push(`Condition: ${contrast}`);
    return lines.join('\n');
  }

  const { plate, cellLine, drug, drugDisplay, concentration, durationDisplay, well } = parsed;

  const lines = [
    `Cell line: ${cellLine}`,
    `Perturbagen: ${drugDisplay}${concentration ? ` (${concentration})` : ''}`,
    `Treatment: ${durationDisplay !== 'treatment' ? durationDisplay : 'X hours (unspecified)'}`,
    `Microplate: ${plate}  ·  Well: ${well}`,
    `Dataset: LINCS L1000`,
  ];
  return lines.join('\n');
}
