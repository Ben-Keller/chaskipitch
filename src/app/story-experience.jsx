import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, resolveSequenceSrc } from "../lib/story-math";

const BASE_TEXT_LAYOUT_WIDTH = 1440;
const TEXT_MAX_WIDTH_SCALE = 1.45;
const TEXT_MIN_WIDTH_PX = 160;

function computeTextOpacityMap(texts, localProgress, sequenceFrameCount) {
  const textLayers = (texts ?? [])
    .slice()
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

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
    const characters = String(layer?.content ?? "")
      .replace(/\s+/g, " ")
      .trim().length;
    const triggerSpan = clamp((layer?.end ?? 1) - (layer?.start ?? 0), 0.08, 0.95);
    const readFrames = clamp(10 + Math.ceil(characters / 9), 10, Math.max(14, Math.round(totalFrames * 0.85)));
    return Math.max(triggerSpan, toProgress(readFrames));
  });

  const overlapBudget = overlap * Math.max(0, count - 1);
  const totalDesired = desiredDurations.reduce((sum, value) => sum + value, 0);
  const maxDesired = Math.max(0.08, 1 + overlapBudget);
  const scale = totalDesired > maxDesired ? maxDesired / totalDesired : 1;
  const durations = desiredDurations.map((value) => value * scale);

  const schedule = [];
  let cursor = clamp(textLayers[0]?.start ?? 0, 0, 0.2);
  for (let index = 0; index < count; index += 1) {
    const layer = textLayers[index];
    const triggerStart = clamp(layer?.start ?? 0);
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

function getSceneProgressLabel(scenes, progress) {
  if (!scenes.length) {
    return "";
  }
  const index = Math.min(scenes.length - 1, Math.max(0, Math.floor(progress * scenes.length)));
  const scene = scenes[index];
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
  const [hasEntered, setHasEntered] = useState(false);
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : BASE_TEXT_LAYOUT_WIDTH
  );

  const scenes = useMemo(
    () =>
      (story?.scenes ?? []).filter(
        (scene) => scene?.media?.srcPattern && Number.isFinite(Number(scene?.media?.frameCount))
      ),
    [story?.scenes]
  );

  const sceneLabel = useMemo(() => getSceneProgressLabel(scenes, timelineProgress), [scenes, timelineProgress]);

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
    if (!scenes.length) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY * 0.00045;
    if (!hasEntered) {
      setHasEntered(true);
    }
    setTimelineProgress((previous) => clamp(previous + delta, 0, 1));
  };

  const handlePointerDown = (event) => {
    if (!scenes.length) {
      return;
    }
    if (!hasEntered) {
      setHasEntered(true);
    }
    dragStartY.current = event.clientY;
    shellRef.current?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (dragStartY.current === null || !scenes.length) {
      return;
    }
    if (!hasEntered) {
      setHasEntered(true);
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

  const handleKeyDown = (event) => {
    if (!scenes.length) {
      return;
    }

    if ([" ", "Enter", "ArrowDown", "PageDown"].includes(event.key)) {
      event.preventDefault();
      if (!hasEntered) {
        setHasEntered(true);
      }
      setTimelineProgress((previous) => clamp(previous + 0.045, 0, 1));
      return;
    }

    if (["ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      if (!hasEntered) {
        setHasEntered(true);
      }
      setTimelineProgress((previous) => clamp(previous - 0.045, 0, 1));
    }
  };

  return (
    <section
      ref={shellRef}
      className={`pitch-shell${hasEntered ? "" : " pitch-shell--intro"}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Creative scrollytelling pitch"
    >
      {!hasEntered ? (
        <div className="pitch-intro">
          <div className="pitch-intro__panel">
            <p className="pitch-intro__kicker">{story?.projectTitle ?? "Creative Pitch"}</p>
            <h2 className="pitch-intro__title">Scroll down to start the journey</h2>
            <p className="pitch-intro__hint">Or drag to move through the story frames.</p>
            <button
              type="button"
              className="pitch-intro__button"
              onClick={() => setHasEntered(true)}
            >
              Start Journey
            </button>
            <div className="pitch-intro__scrollCue" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      ) : null}
      <div className="pitch-topbar">
        <span className="pitch-topbar__title">{story?.projectTitle}</span>
        <span className="pitch-topbar__scene">{hasEntered ? sceneLabel : "Ready to begin"}</span>
        <div className="pitch-progress" aria-hidden="true">
          <span style={{ width: `${hasEntered ? timelineProgress * 100 : 0}%` }} />
        </div>
      </div>
      <div className="pitch-stage" role="img" aria-label="Creative pitch stage">
        {scenes.map((scene, index) => {
          const totalScenes = Math.max(1, scenes.length);
          const start = index / totalScenes;
          const end = (index + 1) / totalScenes;
          const local = clamp((timelineProgress - start) / Math.max(0.0001, end - start));

          const frameCount = Math.max(1, Math.round(scene.media?.frameCount ?? 1));
          const frame = Math.round(1 + local * Math.max(0, frameCount - 1));
          const src = resolveSequenceSrc(scene.media?.srcPattern ?? "", frame, frameCount);

          const fadeWindow = 0.18;
          const fadeIn = clamp(local / fadeWindow);
          const fadeOut = clamp((1 - local) / fadeWindow);
          const opacity = Math.min(fadeIn, fadeOut);
          const zoom = scene.gentleZoom ? 1 + local * 0.045 + timelineProgress * 0.01 : 1;
          const texts = scene.texts ?? [];
          const textOpacityMap = computeTextOpacityMap(texts, local, frameCount);

          return (
            <div key={scene.id} className="pitch-scene" style={{ opacity, backgroundColor: scene.bgColor }}>
              {src ? (
                <img
                  className="pitch-scene__img"
                  src={src}
                  alt={scene.title || "Story frame"}
                  draggable="false"
                  style={{ transform: `scale(${zoom})` }}
                />
              ) : null}
              <div className="pitch-scene__textOverlay">
                {texts.map((textLayer) => {
                  const left = textLayer.xPct ?? 50;
                  const top = textLayer.yPct ?? 50;
                  const desktopSize = textLayer.fontSizeDesktopPx ?? 20;
                  const mobileSize = Math.max(14, (textLayer.fontSizeMobilePx ?? 18) * 0.95);
                  const textOpacity = clamp(textOpacityMap[textLayer.id] ?? 0);
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
                        minHeight: `${textLayer.heightVh ?? 0}vh`,
                        transform: isCenterAligned ? "translateX(-50%)" : "none",
                        opacity: opacity * textOpacity
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontFamily: textLayer.fontFamily ?? "inherit",
                          fontSize: `clamp(${mobileSize}px, ${desktopSize}px, ${desktopSize * 1.2}px)`,
                          fontWeight: textLayer.fontWeight ?? 400,
                          textAlign: textLayer.textAlign ?? "left",
                          whiteSpace: "pre-wrap"
                        }}
                      >
                        {textLayer.content}
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
