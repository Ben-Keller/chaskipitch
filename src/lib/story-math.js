export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function resolveSequenceSrc(pattern, frame, frameCount) {
  if (!pattern) {
    return "";
  }
  const safeCount =
    typeof frameCount === "number" && Number.isFinite(frameCount)
      ? Math.max(1, Math.round(frameCount))
      : null;
  const clamped = safeCount
    ? Math.max(1, Math.min(safeCount, Math.round(frame)))
    : Math.max(1, Math.round(frame));
  return pattern.replace("%04d", String(clamped).padStart(4, "0"));
}
