export function normalizeRotationAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  return ((angle % 360) + 360) % 360;
}

export function normalizeSliderTrace(trace) {
  if (!Array.isArray(trace)) return [];
  const normalized = trace
    .map((item) => ({ x: Number(item?.x), t: Number(item?.t) }))
    .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.t))
    .sort((a, b) => a.t - b.t);

  if (normalized.length === 0) return [];
  const baseT = normalized[0].t;
  return normalized.map((item) => ({ x: item.x, t: Math.max(0, item.t - baseT) }));
}
