import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, resolveSequenceSrc } from "../lib/story-math";

const BASE_TEXT_LAYOUT_WIDTH = 1440;
const TEXT_MAX_WIDTH_SCALE = 1.45;
const TEXT_MIN_WIDTH_PX = 160;
const DEFAULT_PLAYBACK_FPS = 24;
const DEFAULT_AUTOPLAY_SPEED_MULTIPLIER = 1;
const DEFAULT_SCROLL_SECONDS_PER_1000PX = 1.6;
const DEFAULT_DRAG_SECONDS_PER_1000PX = 3;
const DEFAULT_KEYBOARD_STEP_SECONDS = 1.1;
const DEFAULT_TEXT_FADE_SECONDS = 0.2;
const STEP_ANIMATION_MIN_MS = 240;
const STEP_ANIMATION_MAX_MS = 760;
const INTRO_RESTORE_THRESHOLD_SECONDS = 0.001;
const END_RETURN_VISIBILITY_PROGRESS = 0.995;
const SCENE_FADE_WINDOW = 0.18;
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [data-pitch-control]";

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

function resolveSceneDurationSeconds(scene, fallbackFps) {
  const explicitDuration = Number(scene?.media?.durationSeconds);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.max(0.4, explicitDuration);
  }

  const frameCount = Math.max(1, Math.round(Number(scene?.media?.frameCount ?? 1)));
  const fps = Number(scene?.media?.frameRate ?? fallbackFps);
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : fallbackFps;
  return Math.max(0.4, frameCount / Math.max(1, safeFps));
}

function buildTimelineSegments(scenes, fallbackFps) {
  let cursorSeconds = 0;
  const segments = scenes.map((scene, index) => {
    const durationSeconds = resolveSceneDurationSeconds(scene, fallbackFps);
    const startSeconds = cursorSeconds;
    const endSeconds = startSeconds + durationSeconds;
    cursorSeconds = endSeconds;
    return {
      index,
      id: scene?.id ?? `scene_${index + 1}`,
      startSeconds,
      endSeconds,
      durationSeconds
    };
  });

  return {
    segments,
    totalDurationSeconds: Math.max(0.0001, cursorSeconds)
  };
}

function findSceneIndexBySeconds(segments, elapsedSeconds) {
  if (!segments.length) {
    return -1;
  }
  const safeSeconds = Math.max(0, elapsedSeconds);
  for (let index = 0; index < segments.length; index += 1) {
    if (safeSeconds < segments[index].endSeconds) {
      return index;
    }
  }
  return segments.length - 1;
}

function computeTextOpacityMap(
  texts,
  localProgress,
  sceneDurationSeconds,
  textFadeSeconds
) {
  const textLayers = (texts ?? [])
    .slice()
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  const output = {};
  if (!textLayers.length) {
    return output;
  }

  const safeDuration = Math.max(0.2, Number(sceneDurationSeconds) || 0.2);
  const baseFadeProgress = clamp((Number(textFadeSeconds) || 0) / safeDuration, 0.01, 0.45);
  // Match the slower perceived edge timing (first in / last out) for all text transitions.
  const sharedFadeInProgress = clamp(Math.max(baseFadeProgress, SCENE_FADE_WINDOW), 0.01, 0.45);
  const sharedFadeOutProgress = clamp(Math.max(baseFadeProgress, SCENE_FADE_WINDOW), 0.01, 0.45);

  textLayers.forEach((layer, index) => {
    const entryStart = clamp(Number(layer?.start ?? 0), 0, 1);
    const entryEnd = clamp(Number(layer?.end ?? 1), entryStart + 0.01, 1);
    const span = Math.max(0.01, entryEnd - entryStart);
    const fadeInProgress = Math.min(sharedFadeInProgress, span * 0.95);
    const fadeOutProgress = Math.min(sharedFadeOutProgress, span * 0.95);
    const fadeInEnd = Math.min(entryEnd, entryStart + fadeInProgress);
    const fadeOutStart = Math.max(entryStart, entryEnd - fadeOutProgress);

    const fadeIn = clamp(
      (localProgress - entryStart) / Math.max(0.0001, fadeInEnd - entryStart)
    );
    const fadeOut = clamp(
      (entryEnd - localProgress) / Math.max(0.0001, entryEnd - fadeOutStart)
    );
    const key = layer?.id ?? `text_${index}`;
    output[key] = Math.min(fadeIn, fadeOut);
  });

  return output;
}

function getSceneProgressLabel(scenes, sceneIndex) {
  if (!scenes.length || sceneIndex < 0 || sceneIndex >= scenes.length) {
    return "";
  }
  const scene = scenes[sceneIndex];
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

function isLiveWindowActive() {
  if (typeof document === "undefined") {
    return true;
  }
  if (document.visibilityState !== "visible") {
    return false;
  }
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
}

function BufferedSceneImage({ src, alt, zoom }) {
  const [displayedSrc, setDisplayedSrc] = useState(src || "");
  const loadedSourcesRef = useRef(new Set());

  useEffect(() => {
    if (!src) {
      setDisplayedSrc("");
      return undefined;
    }

    if (displayedSrc === src) {
      loadedSourcesRef.current.add(src);
      return undefined;
    }

    if (loadedSourcesRef.current.has(src)) {
      setDisplayedSrc(src);
      return undefined;
    }

    if (typeof Image === "undefined") {
      setDisplayedSrc(src);
      return undefined;
    }

    let cancelled = false;
    const preloader = new Image();
    preloader.src = src;

    const commitSwap = () => {
      if (cancelled) {
        return;
      }
      loadedSourcesRef.current.add(src);
      setDisplayedSrc(src);
    };

    preloader.onload = () => {
      const decoder = preloader.decode?.();
      if (decoder && typeof decoder.then === "function") {
        decoder.then(commitSwap).catch(commitSwap);
        return;
      }
      commitSwap();
    };

    preloader.onerror = () => {
      if (!cancelled && !displayedSrc) {
        setDisplayedSrc(src);
      }
    };

    return () => {
      cancelled = true;
      preloader.onload = null;
      preloader.onerror = null;
    };
  }, [src, displayedSrc]);

  if (!displayedSrc) {
    return null;
  }

  return (
    <img
      className="pitch-scene__img"
      src={displayedSrc}
      alt={alt}
      draggable="false"
      style={{ transform: `scale(${zoom})` }}
    />
  );
}

export function StoryExperience({ story }) {
  const shellRef = useRef(null);
  const dragStartY = useRef(null);
  const timelineSecondsRef = useRef(0);
  const stepAnimationFrameRef = useRef(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [isAutoplay, setIsAutoplay] = useState(false);
  const [timelineSeconds, setTimelineSeconds] = useState(0);
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

  const fallbackPlaybackFps = useMemo(() => {
    const configured = Number(story?.playback?.frameRate);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return DEFAULT_PLAYBACK_FPS;
  }, [story?.playback?.frameRate]);

  const { segments: timelineSegments, totalDurationSeconds } = useMemo(
    () => buildTimelineSegments(scenes, fallbackPlaybackFps),
    [scenes, fallbackPlaybackFps]
  );

  const timelineProgress = useMemo(
    () => clamp(timelineSeconds / Math.max(0.0001, totalDurationSeconds), 0, 1),
    [timelineSeconds, totalDurationSeconds]
  );

  const currentSceneIndex = useMemo(
    () => findSceneIndexBySeconds(timelineSegments, timelineSeconds),
    [timelineSegments, timelineSeconds]
  );

  const sceneLabel = useMemo(
    () => getSceneProgressLabel(scenes, currentSceneIndex),
    [scenes, currentSceneIndex]
  );

  const scrollSecondsPerPx = useMemo(() => {
    const configured = Number(story?.playback?.scrollSecondsPer1000Px);
    const secondsPer1000 = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_SCROLL_SECONDS_PER_1000PX;
    return clamp(secondsPer1000 / 1000, 0.0002, 0.03);
  }, [story?.playback?.scrollSecondsPer1000Px]);

  const dragSecondsPerPx = useMemo(() => {
    const configured = Number(story?.playback?.dragSecondsPer1000Px);
    const secondsPer1000 = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_DRAG_SECONDS_PER_1000PX;
    return clamp(secondsPer1000 / 1000, 0.0002, 0.05);
  }, [story?.playback?.dragSecondsPer1000Px]);

  const keyboardStepSeconds = useMemo(() => {
    const configured = Number(story?.playback?.keyboardStepSeconds);
    const value = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_KEYBOARD_STEP_SECONDS;
    return clamp(value, 0.08, 4);
  }, [story?.playback?.keyboardStepSeconds]);

  const autoplaySpeedMultiplier = useMemo(() => {
    const configured = Number(story?.playback?.autoplaySpeedMultiplier);
    const value = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_AUTOPLAY_SPEED_MULTIPLIER;
    return clamp(value, 0.1, 6);
  }, [story?.playback?.autoplaySpeedMultiplier]);

  const textFadeSeconds = useMemo(() => {
    const configured = Number(story?.playback?.textFadeSeconds);
    const value = Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_TEXT_FADE_SECONDS;
    return clamp(value, 0.05, 2);
  }, [story?.playback?.textFadeSeconds]);

  useEffect(() => {
    timelineSecondsRef.current = timelineSeconds;
  }, [timelineSeconds]);

  useEffect(() => {
    if (timelineSeconds > totalDurationSeconds) {
      setTimelineSeconds(totalDurationSeconds);
    }
  }, [timelineSeconds, totalDurationSeconds]);

  useEffect(() => {
    if (!hasEntered || isAutoplay) {
      return;
    }
    if (timelineSeconds <= INTRO_RESTORE_THRESHOLD_SECONDS) {
      setHasEntered(false);
    }
  }, [hasEntered, isAutoplay, timelineSeconds]);

  useEffect(
    () => () => {
      if (stepAnimationFrameRef.current !== null) {
        cancelAnimationFrame(stepAnimationFrameRef.current);
        stepAnimationFrameRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!isAutoplay || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const pauseIfNotActive = () => {
      if (!isLiveWindowActive()) {
        setIsAutoplay(false);
      }
    };

    pauseIfNotActive();
    document.addEventListener("visibilitychange", pauseIfNotActive);
    window.addEventListener("blur", pauseIfNotActive);
    window.addEventListener("pagehide", pauseIfNotActive);

    return () => {
      document.removeEventListener("visibilitychange", pauseIfNotActive);
      window.removeEventListener("blur", pauseIfNotActive);
      window.removeEventListener("pagehide", pauseIfNotActive);
    };
  }, [isAutoplay]);

  const cancelStepAnimation = () => {
    if (stepAnimationFrameRef.current !== null) {
      cancelAnimationFrame(stepAnimationFrameRef.current);
      stepAnimationFrameRef.current = null;
    }
  };

  const animateToSeconds = (targetSeconds, durationMs) => {
    cancelStepAnimation();
    const from = timelineSecondsRef.current;
    const to = clamp(targetSeconds, 0, totalDurationSeconds);
    if (Math.abs(to - from) < 0.0001) {
      setTimelineSeconds(to);
      return;
    }

    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const t = clamp(elapsed / Math.max(1, durationMs), 0, 1);
      const eased = 1 - (1 - t) * (1 - t);
      const value = from + (to - from) * eased;
      setTimelineSeconds(value);
      if (t < 1) {
        stepAnimationFrameRef.current = requestAnimationFrame(step);
      } else {
        stepAnimationFrameRef.current = null;
      }
    };
    stepAnimationFrameRef.current = requestAnimationFrame(step);
  };

  const enterAndGiveUserControl = () => {
    if (!hasEntered) {
      setHasEntered(true);
    }
    if (isAutoplay) {
      setIsAutoplay(false);
    }
    cancelStepAnimation();
  };

  useEffect(() => {
    if (!isAutoplay || !hasEntered || !scenes.length) {
      return undefined;
    }

    let rafId = null;
    let last = performance.now();

    const tick = (now) => {
      const deltaMs = Math.max(0, now - last);
      last = now;
      let finished = false;
      setTimelineSeconds((previous) => {
        const next = clamp(previous + (deltaMs / 1000) * autoplaySpeedMultiplier, 0, totalDurationSeconds);
        finished = next >= totalDurationSeconds;
        return next;
      });
      if (finished) {
        setIsAutoplay(false);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isAutoplay, hasEntered, scenes.length, totalDurationSeconds, autoplaySpeedMultiplier]);

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

  useEffect(() => {
    const shellElement = shellRef.current;
    if (!shellElement) {
      return undefined;
    }
    const handleWheelNative = (event) => {
      if (!scenes.length) {
        return;
      }
      if (isInteractiveTarget(event.target)) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      enterAndGiveUserControl();
      const deltaSeconds = event.deltaY * scrollSecondsPerPx;
      setTimelineSeconds((previous) => clamp(previous + deltaSeconds, 0, totalDurationSeconds));
    };
    shellElement.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => {
      shellElement.removeEventListener("wheel", handleWheelNative);
    };
  }, [
    scenes.length,
    scrollSecondsPerPx,
    totalDurationSeconds,
    hasEntered,
    isAutoplay
  ]);

  const handlePointerDown = (event) => {
    if (!scenes.length) {
      return;
    }
    if (isInteractiveTarget(event.target)) {
      return;
    }
    enterAndGiveUserControl();
    dragStartY.current = event.clientY;
    shellRef.current?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (dragStartY.current === null || !scenes.length) {
      return;
    }
    if (isInteractiveTarget(event.target)) {
      return;
    }
    enterAndGiveUserControl();
    const deltaSeconds = (dragStartY.current - event.clientY) * dragSecondsPerPx;
    dragStartY.current = event.clientY;
    setTimelineSeconds((previous) => clamp(previous + deltaSeconds, 0, totalDurationSeconds));
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
    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      cancelStepAnimation();
      setHasEntered(true);
      if (isAutoplay) {
        setIsAutoplay(false);
      } else {
        if (timelineSecondsRef.current >= totalDurationSeconds - 0.001) {
          setTimelineSeconds(0);
        }
        setIsAutoplay(true);
      }
      return;
    }

    if (["Enter", "ArrowDown", "PageDown"].includes(event.key)) {
      event.preventDefault();
      enterAndGiveUserControl();
      setTimelineSeconds((previous) =>
        clamp(previous + keyboardStepSeconds, 0, totalDurationSeconds)
      );
      return;
    }

    if (["ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      enterAndGiveUserControl();
      setTimelineSeconds((previous) =>
        clamp(previous - keyboardStepSeconds, 0, totalDurationSeconds)
      );
    }
  };

  const handleStartJourney = () => {
    if (!scenes.length) {
      return;
    }
    cancelStepAnimation();
    setTimelineSeconds(0);
    setHasEntered(true);
    setIsAutoplay(true);
  };

  const handleToggleAutoplay = () => {
    if (!scenes.length) {
      return;
    }
    if (isAutoplay) {
      setIsAutoplay(false);
      return;
    }
    cancelStepAnimation();
    setHasEntered(true);
    if (timelineSecondsRef.current >= totalDurationSeconds - 0.001) {
      setTimelineSeconds(0);
    }
    setIsAutoplay(true);
  };

  const stepBySequence = (direction) => {
    if (!scenes.length || !timelineSegments.length) {
      return;
    }
    enterAndGiveUserControl();

    const currentIndex = findSceneIndexBySeconds(timelineSegments, timelineSecondsRef.current);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = clamp(currentIndex + direction, 0, timelineSegments.length - 1);
    let targetSeconds = timelineSegments[targetIndex]?.startSeconds ?? timelineSecondsRef.current;

    if (direction > 0 && targetIndex === currentIndex) {
      targetSeconds = timelineSegments[currentIndex]?.endSeconds ?? totalDurationSeconds;
    }

    const distanceSeconds = Math.abs(targetSeconds - timelineSecondsRef.current);
    const durationMs = clamp(220 + distanceSeconds * 260, STEP_ANIMATION_MIN_MS, STEP_ANIMATION_MAX_MS);
    animateToSeconds(targetSeconds, durationMs);
  };

  const handleReturnToStart = () => {
    if (!scenes.length) {
      return;
    }
    enterAndGiveUserControl();
    const currentSeconds = timelineSecondsRef.current;
    const reverseDurationMs = clamp(420 + currentSeconds * 110, 680, 2400);
    animateToSeconds(0, reverseDurationMs);
  };

  const isAtJourneyEnd =
    hasEntered && scenes.length > 0 && timelineProgress >= END_RETURN_VISIBILITY_PROGRESS;

  return (
    <section
      ref={shellRef}
      className={`pitch-shell${hasEntered ? "" : " pitch-shell--intro"}`}
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
            <p className="pitch-intro__hint">Or view the guided proposal of the creative concept</p>
            <button type="button" className="pitch-intro__button" onClick={handleStartJourney}>
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
          const segment = timelineSegments[index];
          if (!segment) {
            return null;
          }
          const local = clamp(
            (timelineSeconds - segment.startSeconds) / Math.max(0.0001, segment.durationSeconds),
            0,
            1
          );

          const frameCount = Math.max(1, Math.round(scene.media?.frameCount ?? 1));
          const frame = Math.round(1 + local * Math.max(0, frameCount - 1));
          const src = resolveSequenceSrc(scene.media?.srcPattern ?? "", frame, frameCount);

          const fadeIn = clamp(local / SCENE_FADE_WINDOW);
          const fadeOut = clamp((1 - local) / SCENE_FADE_WINDOW);
          const opacity = Math.min(fadeIn, fadeOut);
          const zoom = scene.gentleZoom ? 1 + local * 0.045 + timelineProgress * 0.01 : 1;
          const texts = scene.texts ?? [];
          const textOpacityMap = computeTextOpacityMap(
            texts,
            local,
            segment.durationSeconds,
            textFadeSeconds
          );

          return (
            <div key={scene.id} className="pitch-scene" style={{ opacity, backgroundColor: scene.bgColor }}>
              {src ? (
                <BufferedSceneImage
                  src={src}
                  alt={scene.title || "Story frame"}
                  zoom={zoom}
                />
              ) : null}
              <div className="pitch-scene__textOverlay">
                {texts.map((textLayer, textIndex) => {
                  const left = textLayer.xPct ?? 50;
                  const top = textLayer.yPct ?? 50;
                  const desktopSize = textLayer.fontSizeDesktopPx ?? 20;
                  const mobileSize = Math.max(14, (textLayer.fontSizeMobilePx ?? 18) * 0.95);
                  const textProgressKey = textLayer.id ?? `text_${textIndex}`;
                  const key = textLayer.id ?? `${scene.id}_text_${textIndex}`;
                  const textOpacity = clamp(textOpacityMap[textProgressKey] ?? 0);
                  const defaultMaxWidthVw = Math.max(8, Number(textLayer.widthVw) || 24);
                  const isCenterAligned = String(textLayer.textAlign ?? "").toLowerCase() === "center";
                  const centerAnchorPct = clamp(left + defaultMaxWidthVw / 2, 0, 100);
                  const edgeAwareMaxWidthPx = isCenterAligned
                    ? getCenteredEdgeAwareTextMaxWidthPx(centerAnchorPct, defaultMaxWidthVw, viewportWidth)
                    : getEdgeAwareTextMaxWidthPx(left, defaultMaxWidthVw, viewportWidth);

                  return (
                    <div
                      key={key}
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
      {hasEntered ? (
        <div className="pitch-controls" aria-label="Journey playback controls" data-pitch-control>
          <button
            type="button"
            className="pitch-controls__btn"
            data-pitch-control
            onClick={() => stepBySequence(-1)}
            aria-label="Previous sequence"
          >
            &lt;
          </button>
          <button
            type="button"
            className="pitch-controls__btn pitch-controls__btn--primary"
            data-pitch-control
            onClick={handleToggleAutoplay}
            aria-label={isAutoplay ? "Pause autoplay" : "Play autoplay"}
          >
            <span className="pitch-controls__icon" aria-hidden="true">
              {isAutoplay ? "\u23F8" : "\u25B6"}
            </span>
          </button>
          <button
            type="button"
            className="pitch-controls__btn"
            data-pitch-control
            onClick={() => stepBySequence(1)}
            aria-label="Next sequence"
          >
            &gt;
          </button>
        </div>
      ) : null}
      {isAtJourneyEnd ? (
        <button
          type="button"
          className="pitch-return"
          data-pitch-control
          onClick={handleReturnToStart}
          aria-label="Return to start"
        >
          <span className="pitch-return__icon" aria-hidden="true">
            ^
          </span>
          <span className="pitch-return__label">Return to start</span>
        </button>
      ) : null}
    </section>
  );
}
