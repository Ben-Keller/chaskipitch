import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, interpolateLayer, resolveSequenceSrc } from "../lib/story-math";

const BASE_TEXT_LAYOUT_WIDTH = 1440;
const TEXT_MAX_WIDTH_SCALE = 1.45;
const TEXT_MIN_WIDTH_PX = 160;

function computeTextOpacityMap(scene, localProgress, sequenceFrameCount) {
  const textLayers = (scene?.layers ?? [])
    .filter((layer) => layer.kind === "text")
    .slice()
    .sort((a, b) => (a.triggerStart ?? 0) - (b.triggerStart ?? 0));

  const output = {};
  const totalFrames = Math.max(2, Math.round(sequenceFrameCount || 1));
  const toProgress = (frames) => frames / Math.max(1, totalFrames - 1);
  const count = textLayers.length;
  if (!count) {
    return output;
  }

  const overlapFrames = clamp(Math.round(totalFrames * 0.24), 4, 14);
  const fadeFrames = clamp(Math.round(totalFrames * 0.12), 2, 8);
  const overlap = toProgress(overlapFrames);
  const fade = toProgress(fadeFrames);

  const desiredDurations = textLayers.map((layer) => {
    const characters = String(layer?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim().length;
    const triggerSpan = clamp((layer?.triggerEnd ?? 1) - (layer?.triggerStart ?? 0), 0.08, 0.95);
    const readFrames = clamp(10 + Math.ceil(characters / 9), 10, Math.max(14, Math.round(totalFrames * 0.85)));
    return Math.max(triggerSpan, toProgress(readFrames));
  });

  const overlapBudget = overlap * Math.max(0, count - 1);
  const totalDesired = desiredDurations.reduce((sum, value) => sum + value, 0);
  const maxDesired = Math.max(0.08, 1 + overlapBudget);
  const scale = totalDesired > maxDesired ? maxDesired / totalDesired : 1;
  const durations = desiredDurations.map((value) => value * scale);

  const schedule = [];
  let cursor = clamp(textLayers[0]?.triggerStart ?? 0, 0, 0.2);
  for (let index = 0; index < count; index += 1) {
    const layer = textLayers[index];
    const triggerStart = clamp(layer?.triggerStart ?? 0);
    const start = index === 0 ? Math.min(cursor, triggerStart) : Math.min(cursor, triggerStart + overlap * 0.4);
    const end = Math.min(1, start + durations[index]);
    schedule.push({ id: layer.id, start, end });
    cursor = Math.max(0, end - overlap);
  }

  const last = schedule[schedule.length - 1];
  if (last && last.end < 0.98) {
    const tail = 1 - last.end;
    schedule[schedule.length - 1] = { ...last, end: 1 };
    for (let index = schedule.length - 2; index >= 0 && tail > 0.01; index -= 1) {
      schedule[index] = { ...schedule[index], end: Math.min(1, schedule[index].end + tail * 0.5) };
    }
  }

  schedule.forEach((entry) => {
    const fadeIn = clamp((localProgress - entry.start) / Math.max(0.0001, fade));
    const fadeOut = clamp((entry.end - localProgress) / Math.max(0.0001, fade));
    output[entry.id] = Math.min(fadeIn, fadeOut);
  });

  return output;
}

function getSceneProgressLabel(sequenceScenes, progress) {
  if (!sequenceScenes.length) {
    return "";
  }
  const index = Math.min(
    sequenceScenes.length - 1,
    Math.max(0, Math.floor(progress * sequenceScenes.length))
  );
  const scene = sequenceScenes[index]?.scene;
  if (!scene) {
    return "";
  }
  return `${scene.id} · ${scene.title}`;
}

function getEdgeAwareTextMaxWidthPx(
  leftPct,
  defaultWidthVw,
  viewportWidth,
  gutterPx = 16,
  baselineWidthPx = BASE_TEXT_LAYOUT_WIDTH
) {
  const safeViewportWidth = Math.max(320, Number(viewportWidth) || baselineWidthPx);
  const safeLeftPct = clamp(Number(leftPct) || 0, 0, 100);
  const safeDefaultWidthVw = Math.max(8, Number(defaultWidthVw) || 24);
  const safeLeftPx = (safeLeftPct / 100) * safeViewportWidth;
  const defaultMaxPx = Math.max(
    TEXT_MIN_WIDTH_PX,
    (safeDefaultWidthVw / 100) * baselineWidthPx * TEXT_MAX_WIDTH_SCALE
  );
  const availableToRightPx = Math.max(48, safeViewportWidth - safeLeftPx - gutterPx);
  return Math.min(defaultMaxPx, availableToRightPx);
}

function getCenteredEdgeAwareTextMaxWidthPx(
  centerPct,
  defaultWidthVw,
  viewportWidth,
  gutterPx = 16,
  baselineWidthPx = BASE_TEXT_LAYOUT_WIDTH
) {
  const safeViewportWidth = Math.max(320, Number(viewportWidth) || baselineWidthPx);
  const safeCenterPct = clamp(Number(centerPct) || 50, 0, 100);
  const safeDefaultWidthVw = Math.max(8, Number(defaultWidthVw) || 24);
  const safeCenterPx = (safeCenterPct / 100) * safeViewportWidth;
  const defaultMaxPx = Math.max(
    TEXT_MIN_WIDTH_PX,
    (safeDefaultWidthVw / 100) * baselineWidthPx * TEXT_MAX_WIDTH_SCALE
  );
  const leftRoom = Math.max(24, safeCenterPx - gutterPx);
  const rightRoom = Math.max(24, safeViewportWidth - safeCenterPx - gutterPx);
  const symmetricEdgeMax = Math.max(48, Math.min(leftRoom, rightRoom) * 2);
  return Math.min(defaultMaxPx, symmetricEdgeMax);
}

export function StoryExperience({ story }) {
  const shellRef = useRef(null);
  const dragStartY = useRef(null);
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : BASE_TEXT_LAYOUT_WIDTH
  );

  const sequenceScenes = useMemo(() => {
    return (story?.scenes ?? [])
      .map((scene) => {
        const sequenceLayer = scene.layers.find(
          (layer) => layer.assetMode === "sequence" && layer.sequence?.srcPattern && layer.sequence?.frameCount
        );
        if (sequenceLayer) {
          return { scene, layer: sequenceLayer };
        }
        const fallbackImageLayer = scene.layers.find((layer) => layer.kind === "image" && layer.assetPath);
        if (!fallbackImageLayer) {
          return null;
        }
        return { scene, layer: fallbackImageLayer };
      })
      .filter(Boolean);
  }, [story?.scenes]);

  const sceneLabel = useMemo(
    () => getSceneProgressLabel(sequenceScenes, timelineProgress),
    [sequenceScenes, timelineProgress]
  );

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth || BASE_TEXT_LAYOUT_WIDTH);
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const handleWheel = (event) => {
    if (!sequenceScenes.length) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY * 0.00045;
    setTimelineProgress((previous) => clamp(previous + delta, 0, 1));
  };

  const handlePointerDown = (event) => {
    if (!sequenceScenes.length) {
      return;
    }
    dragStartY.current = event.clientY;
    shellRef.current?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (dragStartY.current === null || !sequenceScenes.length) {
      return;
    }
    const delta = (dragStartY.current - event.clientY) * 0.0014;
    dragStartY.current = event.clientY;
    setTimelineProgress((previous) => clamp(previous + delta, 0, 1));
  };

  const handlePointerUp = (event) => {
    dragStartY.current = null;
    try {
      shellRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore release errors when pointer capture was not set.
    }
  };

  return (
    <section
      ref={shellRef}
      className="pitch-shell"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="Creative scrollytelling pitch"
    >
      <div className="pitch-topbar">
        <span className="pitch-topbar__title">{story?.projectTitle}</span>
        <span className="pitch-topbar__scene">{sceneLabel}</span>
        <div className="pitch-progress" aria-hidden="true">
          <span style={{ width: `${timelineProgress * 100}%` }} />
        </div>
      </div>
      <div className="pitch-stage" role="img" aria-label="Creative pitch stage">
        {sequenceScenes.map(({ scene, layer }, index) => {
          const totalScenes = Math.max(1, sequenceScenes.length);
          const start = index / totalScenes;
          const end = (index + 1) / totalScenes;
          const local = clamp((timelineProgress - start) / Math.max(0.0001, end - start));

          const frameCount = Math.max(1, Math.round(layer?.sequence?.frameCount ?? 1));
          const frame = Math.round(1 + local * Math.max(0, frameCount - 1));
          const src = layer?.sequence?.srcPattern
            ? resolveSequenceSrc(layer.sequence.srcPattern, frame, frameCount)
            : layer?.assetPath ?? "";

          const fadeWindow = 0.18;
          const fadeIn = clamp(local / fadeWindow);
          const fadeOut = clamp((1 - local) / fadeWindow);
          const opacity = Math.min(fadeIn, fadeOut);
          const disableZoom = scene.id === "S1" || scene.id === "S2" || scene.id === "S5";
          const zoom = disableZoom ? 1 : 1 + local * 0.045 + timelineProgress * 0.01;
          const textLayers = scene.layers.filter((entry) => entry.kind === "text");
          const textOpacityMap = computeTextOpacityMap(scene, local, frameCount);

          return (
            <div key={layer.id} className="pitch-scene" style={{ opacity, backgroundColor: scene.bgColor }}>
              {src ? (
                <img
                  className="pitch-scene__img"
                  src={src}
                  alt={layer.name || scene.title || "Story frame"}
                  draggable="false"
                  style={{ transform: `scale(${zoom})` }}
                />
              ) : null}
              <div className="pitch-scene__textOverlay">
                {textLayers.map((textLayer) => {
                  const keyframe = interpolateLayer(textLayer, local);
                  const first = textLayer.keyframes?.[0];
                  const left = first?.xPct ?? textLayer.baseXPct;
                  const topBase = first?.yPct ?? textLayer.baseYPct;
                  const top = scene.id === "S3" && textLayer.id === "S3_L09" ? topBase + 14 : topBase;
                  const desktopSize = textLayer.fontSizeDesktopPx ?? 20;
                  const mobileSize = Math.max(14, (textLayer.fontSizeMobilePx ?? 18) * 0.95);
                  const textOpacity = clamp(Math.max(textOpacityMap[textLayer.id] ?? 0, keyframe.opacity * 0.35));
                  const defaultMaxWidthVw = Math.max(8, Number(textLayer.widthVw) || 24);
                  const isCenterAligned = String(textLayer.textAlign ?? "").toLowerCase() === "center";
                  const centerAnchorPct = clamp(left + defaultMaxWidthVw / 2, 0, 100);
                  const edgeAwareMaxWidthPx = isCenterAligned
                    ? getCenteredEdgeAwareTextMaxWidthPx(centerAnchorPct, defaultMaxWidthVw, viewportWidth)
                    : getEdgeAwareTextMaxWidthPx(left, defaultMaxWidthVw, viewportWidth);

                  return (
                    <div
                      key={textLayer.id}
                      className="pitch-scene__text"
                      style={{
                        left: `${isCenterAligned ? centerAnchorPct : left}%`,
                        top: `${top}%`,
                        width: "max-content",
                        maxWidth: `${edgeAwareMaxWidthPx}px`,
                        minHeight: `${textLayer.heightVh}vh`,
                        transform: isCenterAligned ? "translateX(-50%)" : "none",
                        opacity: opacity * textOpacity
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: `clamp(${mobileSize}px, ${desktopSize}px, ${desktopSize * 1.2}px)`,
                          fontWeight: textLayer.fontWeight ?? 400,
                          textAlign: textLayer.textAlign ?? "left",
                          whiteSpace: "pre-wrap"
                        }}
                      >
                        {textLayer.textContent}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
