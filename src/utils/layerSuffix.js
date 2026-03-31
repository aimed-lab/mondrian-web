export function getLayerSuffix(layer) {
  if (layer === null || layer === undefined) {
    return '_All';
  }
  const numericLayer = Number(layer);
  if (!Number.isFinite(numericLayer)) {
    return '_All';
  }
  return `_L${Math.trunc(numericLayer)}`;
}
