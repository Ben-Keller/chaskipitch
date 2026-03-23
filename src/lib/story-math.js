export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getBoundingKeyframes(keyframes, progress) {
  const sorted = [...(keyframes ?? [])].sort((a, b) => a.p - b.p);
  if (!sorted.length) {
    return [{ p: 0, xPct: 50, yPct: 50, scale: 1, opacity: 1, rotateDeg: 0, blurPx: 0 }, null, 0];
  }
  if (progress <= sorted[0].p) return [sorted[0], sorted[0], 0];
  if (progress >= sorted[sorted.length - 1].p) return [sorted[sorted.length - 1], sorted[sorted.length - 1], 0];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (progress >= from.p && progress <= to.p) {
      const localT = to.p === from.p ? 0 : (progress - from.p) / (to.p - from.p);
      return [from, to, localT];
    }
  }

  return [sorted[0], sorted[0], 0];
}

export function getLayerLocalProgress(layer, sceneProgress) {
  const start = layer?.triggerStart ?? 0;
  const end = layer?.triggerEnd ?? 1;
  if (sceneProgress <= start) return 0;
  if (sceneProgress >= end) return 1;
  return clamp((sceneProgress - start) / Math.max(0.0001, end - start));
}

export function interpolateLayer(layer, sceneProgress) {
  const local = getLayerLocalProgress(layer, sceneProgress);
  const [from, to, t] = getBoundingKeyframes(layer?.keyframes ?? [], local);
  const sequenceFrameCount =
    typeof layer?.sequence?.frameCount === "number"
      ? Math.max(1, Math.round(layer.sequence.frameCount))
      : null;

  const sourceFrames = (layer?.keyframes ?? [])
    .map((keyframe) => (typeof keyframe?.frame === "number" ? Math.max(1, Math.round(keyframe.frame)) : null))
    .filter((frame) => frame !== null);
  const sourceMaxFrame = sourceFrames.length ? Math.max(...sourceFrames) : null;

  const normalizeFrame = (rawValue) => {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }
    const frame = Math.max(1, Math.round(rawValue));
    if (!sequenceFrameCount) {
      return frame;
    }
    if (sourceMaxFrame && sourceMaxFrame > sequenceFrameCount && sourceMaxFrame > 1) {
      const mapped = Math.round(((frame - 1) / (sourceMaxFrame - 1)) * (sequenceFrameCount - 1) + 1);
      return Math.max(1, Math.min(sequenceFrameCount, mapped));
    }
    return Math.max(1, Math.min(sequenceFrameCount, frame));
  };

  const frameFrom = normalizeFrame(typeof from?.frame === "number" ? from.frame : null);
  const frameTo = normalizeFrame(typeof to?.frame === "number" ? to.frame : frameFrom);
  const frame =
    frameFrom === null && frameTo === null
      ? null
      : Math.round(lerp(frameFrom ?? 1, frameTo ?? frameFrom ?? 1, t));

  return {
    localProgress: local,
    xPct: lerp(from?.xPct ?? layer.baseXPct ?? 50, to?.xPct ?? layer.baseXPct ?? 50, t),
    yPct: lerp(from?.yPct ?? layer.baseYPct ?? 50, to?.yPct ?? layer.baseYPct ?? 50, t),
    scale: lerp(from?.scale ?? 1, to?.scale ?? 1, t),
    opacity: lerp(from?.opacity ?? 1, to?.opacity ?? 1, t),
    rotateDeg: lerp(from?.rotateDeg ?? 0, to?.rotateDeg ?? 0, t),
    blurPx: lerp(from?.blurPx ?? 0, to?.blurPx ?? 0, t),
    frame
  };
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
