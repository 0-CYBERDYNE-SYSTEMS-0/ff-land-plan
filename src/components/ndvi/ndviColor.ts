// NDVI value → CSS color, matching the legacy build's gradient stops.
export function ndviColor(v: number): string {
  if (v < 0.1) return '#8B2500';
  if (v < 0.2) return '#D4380D';
  if (v < 0.3) return '#FFAE00';
  if (v < 0.5) return '#7DC900';
  if (v < 0.7) return '#00A86B';
  return '#006B3C';
}

export function ndviLabel(v: number): string {
  if (v < 0.2) return 'Bare soil';
  if (v < 0.4) return 'Sparse cover';
  if (v < 0.6) return 'Moderate cover';
  return 'Dense vegetation';
}
