import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { geoCentroid, geoNaturalEarth1, geoPath } from "d3";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 560;
const MIN_SCALE = 0.35;
const MAX_SCALE = 48;
const GLOBAL_FIT_EXTENT = [
  [-8, 34],
  [VIEWBOX_WIDTH - 18, VIEWBOX_HEIGHT - 6]
];
const INTERACTION_SETTLE_MS = 170;
const DRAG_THRESHOLD = 6;
const RESIZE_SETTLE_MS = 140;
const RESIZE_WATCHDOG_MS = 2400;
const L_HOME_MIN_WIDTH = 981;
const L_HOME_MAX_WIDTH = 1280;
const M_HOME_MIN_WIDTH = 761;
const M_HOME_MAX_WIDTH = 980;
const S_HOME_MAX_WIDTH = 760;
const XL_HOME_MIN_WIDTH = 1281;
const PAN_LIMIT_EXTRA_LEFT = 120;
const PAN_LIMIT_EXTRA_RIGHT = 180;
const PAN_LIMIT_EXTRA_DOWN = 70;
const XL_RIGHT_JUSTIFY_GAP = 6;
const XL_FOCUS_SHIFT_X = -88;
const XL_FOCUS_SHIFT_Y = -40;
const L_COMMON_SHIFT_X = 20;
const L_COMMON_SHIFT_Y = -18;
const L_GLOBAL_SHIFT_X = 92;
const L_GLOBAL_SHIFT_Y = -14;
const L_FOCUS_SHIFT_X = -56;
const L_FOCUS_SHIFT_Y = -32;
const TERRITORY_TEMPLATE_TARGET_RATIO = 0.085;
const IDENTITY_VIEW = { scale: 1, tx: 0, ty: 0 };
const FULL_FOCUS_RECT = { x0: 0, y0: 0, x1: VIEWBOX_WIDTH, y1: VIEWBOX_HEIGHT };
const FOCUS_RECT_PADDING_PX = 10;
const OCCLUDER_GAP_PX = 10;
const MIN_FOCUS_RECT_WIDTH_PX = 220;
const MIN_FOCUS_RECT_HEIGHT_PX = 180;

const PAGE23_STATUS_STYLE = {
  active: { fill: "#D35E4B", legend: "solid" },
  additional_2024: { fill: "#D35E4B", legend: "diagonal" },
  first_time_2024: { fill: "#D35E4B", legend: "dotted" },
  preparing: { fill: "#EFC56E", legend: "solid" },
  under_assessment: { fill: "#0D7A78", legend: "solid" }
};

const LEGEND_LABEL_OVERRIDES = {
  active: "Countries with active project implementation",
  additional_2024: "Countries where additional projects began implementation",
  first_time_2024: "Countries where work began for the first time",
  preparing: "Countries where projects are being prepared",
  under_assessment: "Countries under assessment for future projects"
};

const LABEL_NAME_OVERRIDE = {
  COD: "DEMOCRATIC REPUBLIC OF CONGO",
  COG: "CONGO BRAZZAVILLE",
  MMR: "BURMA (MYANMAR)"
};

const LABEL_POSITION_OVERRIDES = {
  BLZ: { lng: -91.5, lat: 17.8, anchor: "start" },
  GTM: { lng: -93.4, lat: 15.7, anchor: "start" },
  PAN: { lng: -84.9, lat: 8.9, anchor: "start" },
  ECU: { lng: -81.8, lat: -1.9, anchor: "start" },
  PER: { lng: -80.2, lat: -10.4, anchor: "start" },
  BOL: { lng: -66.5, lat: -16.8, anchor: "start" },
  COL: { lng: -76.0, lat: 6.8, anchor: "start" },
  GUY: { lng: -61.2, lat: 5.7, anchor: "start" },
  SUR: { lng: -57.8, lat: 3.8, anchor: "start" },
  BRA: { lng: -50.8, lat: -14.6, anchor: "start" },
  MLI: { lng: -4.5, lat: 19.5, anchor: "start" },
  BFA: { lng: -1.8, lat: 13.2, anchor: "start" },
  LBR: { lng: -11.7, lat: 6.3, anchor: "start" },
  CMR: { lng: 12.2, lat: 7.0, anchor: "start" },
  COG: { lng: 12.4, lat: -1.2, anchor: "start" },
  COD: { lng: 25.6, lat: -5.8, anchor: "start" },
  KEN: { lng: 39.2, lat: 0.5, anchor: "start" },
  IND: { lng: 77.8, lat: 21.8, anchor: "start" },
  NPL: { lng: 84.6, lat: 28.4, anchor: "start" },
  MMR: { lng: 96.8, lat: 20.4, anchor: "start" },
  KHM: { lng: 106.3, lat: 12.5, anchor: "start" },
  IDN: { lng: 116.1, lat: -7.9, anchor: "start" }
};

const LABEL_TEXT_OVERRIDES = {
  COD: ["DEMOCRATIC", "REPUBLIC OF", "CONGO"],
  COG: ["CONGO", "BRAZZAVILLE"],
  MMR: ["BURMA", "(MYANMAR)"]
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function interpolateTransform(from, to, t) {
  return {
    scale: from.scale + (to.scale - from.scale) * t,
    tx: from.tx + (to.tx - from.tx) * t,
    ty: from.ty + (to.ty - from.ty) * t
  };
}

function toTransformString(view) {
  return `translate(${view.tx} ${view.ty}) scale(${view.scale})`;
}

function clampFocusRect(rect) {
  const normalized = rect && typeof rect === "object" ? rect : FULL_FOCUS_RECT;
  const x0 = clamp(Number(normalized.x0), 0, VIEWBOX_WIDTH - 2);
  const y0 = clamp(Number(normalized.y0), 0, VIEWBOX_HEIGHT - 2);
  const x1 = clamp(Number(normalized.x1), x0 + 2, VIEWBOX_WIDTH);
  const y1 = clamp(Number(normalized.y1), y0 + 2, VIEWBOX_HEIGHT);
  return { x0, y0, x1, y1 };
}

function rectCenter(rect) {
  return {
    x: (rect.x0 + rect.x1) / 2,
    y: (rect.y0 + rect.y1) / 2
  };
}

function rectIntersectionSpan(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function defaultFocusRectForTier(tier) {
  if (tier === "l") {
    return clampFocusRect({
      x0: VIEWBOX_WIDTH * 0.5,
      y0: VIEWBOX_HEIGHT * 0.24,
      x1: VIEWBOX_WIDTH - 10,
      y1: VIEWBOX_HEIGHT - 8
    });
  }
  if (tier === "xl") {
    return clampFocusRect({
      x0: 10,
      y0: VIEWBOX_HEIGHT * 0.2,
      x1: VIEWBOX_WIDTH - 10,
      y1: VIEWBOX_HEIGHT - 8
    });
  }
  return clampFocusRect({
    x0: 10,
    y0: 10,
    x1: VIEWBOX_WIDTH - 10,
    y1: VIEWBOX_HEIGHT - 10
  });
}

function clampTransform(view) {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const scaledWidth = VIEWBOX_WIDTH * scale;
  const scaledHeight = VIEWBOX_HEIGHT * scale;
  const centerTx = (VIEWBOX_WIDTH - scaledWidth) / 2;
  const centerTy = (VIEWBOX_HEIGHT - scaledHeight) / 2;
  const minTx =
    scale >= 1
      ? VIEWBOX_WIDTH - scaledWidth - PAN_LIMIT_EXTRA_LEFT
      : centerTx - PAN_LIMIT_EXTRA_LEFT;
  const maxTx =
    scale >= 1
      ? PAN_LIMIT_EXTRA_RIGHT
      : centerTx + PAN_LIMIT_EXTRA_RIGHT;
  const minTy =
    scale >= 1
      ? VIEWBOX_HEIGHT - scaledHeight
      : centerTy - PAN_LIMIT_EXTRA_DOWN;
  const maxTy =
    scale >= 1
      ? PAN_LIMIT_EXTRA_DOWN
      : centerTy + PAN_LIMIT_EXTRA_DOWN;
  return {
    scale,
    tx: clamp(view.tx, minTx, maxTx),
    ty: clamp(view.ty, minTy, maxTy)
  };
}

function scaleAroundPoint(view, factor, anchorX, anchorY) {
  const nextScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const worldX = (anchorX - view.tx) / view.scale;
  const worldY = (anchorY - view.ty) / view.scale;
  return clampTransform({
    scale: nextScale,
    tx: anchorX - worldX * nextScale,
    ty: anchorY - worldY * nextScale
  });
}

function viewportTierForWidth(width) {
  if (!Number.isFinite(width)) {
    return "xl";
  }
  if (width >= XL_HOME_MIN_WIDTH) {
    return "xl";
  }
  if (width >= L_HOME_MIN_WIDTH && width <= L_HOME_MAX_WIDTH) {
    return "l";
  }
  if (width >= M_HOME_MIN_WIDTH && width <= M_HOME_MAX_WIDTH) {
    return "m";
  }
  if (width <= S_HOME_MAX_WIDTH) {
    return "s";
  }
  return "s";
}

function getStatusFill(status, patternIds) {
  if (status === "additional_2024") {
    return `url(#${patternIds.additional2024})`;
  }
  if (status === "first_time_2024") {
    return `url(#${patternIds.firstTime2024})`;
  }
  return PAGE23_STATUS_STYLE[status]?.fill ?? "#60766f";
}

function getLegendSwatchStyle(statusId) {
  const base = PAGE23_STATUS_STYLE[statusId]?.fill ?? "#60766f";
  if (statusId === "additional_2024") {
    return {
      backgroundColor: base,
      backgroundImage: "repeating-linear-gradient(135deg, rgba(247,241,228,0.9) 0, rgba(247,241,228,0.9) 2px, transparent 2px, transparent 6px)"
    };
  }
  if (statusId === "first_time_2024") {
    return {
      backgroundColor: base,
      backgroundImage: "radial-gradient(rgba(247,241,228,0.9) 1.2px, transparent 1.2px)",
      backgroundSize: "6px 6px"
    };
  }
  return { backgroundColor: base };
}

function getConciseLegendLabel(status) {
  const override = LEGEND_LABEL_OVERRIDES[status?.id];
  if (override) {
    return override;
  }
  return String(status?.label ?? "").trim();
}

function buildLabelLines(name, _projectCount, iso3) {
  const raw = LABEL_NAME_OVERRIDE[iso3] ?? String(name ?? "").toUpperCase();
  const base = `${raw}`;
  if (base.length <= 18) {
    return [base];
  }
  const tokens = base.split(" ");
  const lines = [];
  let current = "";
  tokens.forEach((token) => {
    const candidate = current ? `${current} ${token}` : token;
    if (candidate.length > 18 && current) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 3);
}

function estimateLabelBounds(label) {
  const fontSize = 9.5;
  const lineHeight = fontSize * 1.04;
  const maxChars = Math.max(...label.labelLines.map((line) => line.length), 1);
  const width = Math.max(30, maxChars * 5.45);
  const height = Math.max(lineHeight, label.labelLines.length * lineHeight);
  const x = label.x + label.dx;
  const y = label.y + label.dy;

  let left = x;
  if (label.anchor === "middle") {
    left = x - width / 2;
  } else if (label.anchor === "end") {
    left = x - width;
  }

  const top = y - fontSize * 0.8;
  const pad = 2.5;
  return {
    left: left - pad,
    right: left + width + pad,
    top: top - pad,
    bottom: top + height + pad
  };
}

function boundsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function collectFeatureBounds(features, path) {
  if (!features?.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  features.forEach((feature) => {
    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      return;
    }
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function fitTransformForFeature(feature, path, focusRect = FULL_FOCUS_RECT, fitCoverage = 0.82) {
  if (!feature) {
    return IDENTITY_VIEW;
  }

  const targetRect = clampFocusRect(focusRect);
  const targetWidth = Math.max(1, targetRect.x1 - targetRect.x0);
  const targetHeight = Math.max(1, targetRect.y1 - targetRect.y0);
  const center = rectCenter(targetRect);
  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const dx = Math.max(1, x1 - x0);
  const dy = Math.max(1, y1 - y0);
  const scale = clamp(fitCoverage / Math.max(dx / targetWidth, dy / targetHeight), MIN_SCALE, MAX_SCALE);

  return clampTransform({
    scale,
    tx: center.x - scale * ((x0 + x1) / 2),
    ty: center.y - scale * ((y0 + y1) / 2)
  });
}

function fitTransformForFeatures(features, path, focusRect = FULL_FOCUS_RECT, fitCoverage = 0.84) {
  if (!features?.length) {
    return IDENTITY_VIEW;
  }

  const targetRect = clampFocusRect(focusRect);
  const targetWidth = Math.max(1, targetRect.x1 - targetRect.x0);
  const targetHeight = Math.max(1, targetRect.y1 - targetRect.y0);
  const center = rectCenter(targetRect);
  const bounds = collectFeatureBounds(features, path);
  if (!bounds) {
    return IDENTITY_VIEW;
  }
  const { minX, minY, maxX, maxY } = bounds;

  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);
  const scale = clamp(fitCoverage / Math.max(dx / targetWidth, dy / targetHeight), MIN_SCALE, MAX_SCALE);

  return clampTransform({
    scale,
    tx: center.x - scale * ((minX + maxX) / 2),
    ty: center.y - scale * ((minY + maxY) / 2)
  });
}

export function GlobalMapD3({
  allCountries = [],
  visibleCountries = [],
  selectedRegion = "global",
  isAllThematicsOverview = false,
  worldFootprintGeo = { type: "FeatureCollection", features: [] },
  worldCountriesGeo = { type: "FeatureCollection", features: [] },
  statusDefinitions = [],
  selectedIso = null,
  selectedHighlightIso = [],
  hoveredHighlightIso = [],
  selectedStatusId = null,
  hoveredStatusId = null,
  hoveredIso = null,
  selectedTerritoryGeo = null,
  onCountrySelect = () => {},
  onCountryHover = () => {},
  onStatusSelect = () => {},
  onStatusHover = () => {},
  onClearSelection = () => {},
  overlay = null
}) {
  const [viewportTier, setViewportTier] = useState(() =>
    typeof window !== "undefined" ? viewportTierForWidth(window.innerWidth) : "xl"
  );
  const [resizeRevision, setResizeRevision] = useState(0);

  const patternPrefix = useId().replaceAll(":", "");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [keyboardIso, setKeyboardIso] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const mapGroupRef = useRef(null);
  const viewTransformRef = useRef(IDENTITY_VIEW);
  const animationRef = useRef(0);
  const settleTimerRef = useRef(0);
  const resizeTimerRef = useRef(0);
  const resizeWatchdogTimerRef = useRef(0);
  const resizeRafRef = useRef(0);
  const resizeEventBurstRef = useRef(0);
  const resizeSessionRef = useRef({ active: false, startedAt: 0, events: 0 });
  const dragStateRef = useRef(null);
  const suppressClickRef = useRef(false);
  const shouldDebugResize = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem("impact_map_debug") === "1";
    } catch (_error) {
      return false;
    }
  }, []);

  const logResize = useCallback(
    (message, details = {}) => {
      if (!shouldDebugResize) {
        return;
      }
      console.info("[impact-map/resize]", message, details);
    },
    [shouldDebugResize]
  );

  const patternIds = useMemo(
    () => ({
      additional2024: `${patternPrefix}-additional-2024`,
      firstTime2024: `${patternPrefix}-first-time-2024`,
      selectedClip: `${patternPrefix}-selected-clip`,
      selectedDash: `${patternPrefix}-selected-dash`
    }),
    [patternPrefix]
  );

  useEffect(() => {
    if (window.innerWidth <= 1280) {
      setLegendCollapsed(true);
    }
  }, []);

  const previousAllThematicsRef = useRef(isAllThematicsOverview);

  useEffect(() => {
    if (typeof window === "undefined") {
      previousAllThematicsRef.current = isAllThematicsOverview;
      return;
    }
    if (window.innerWidth < XL_HOME_MIN_WIDTH) {
      previousAllThematicsRef.current = isAllThematicsOverview;
      return;
    }
    const changedFromAllThematics =
      previousAllThematicsRef.current && !isAllThematicsOverview;
    if (changedFromAllThematics) {
      setLegendCollapsed(true);
    }
    previousAllThematicsRef.current = isAllThematicsOverview;
  }, [isAllThematicsOverview]);

  const getFocusRect = useCallback((selectionKind = "global") => {
    const fallback = defaultFocusRectForTier(viewportTier);
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap) {
      return fallback;
    }

    const mapRect = svg.getBoundingClientRect();
    if (!Number.isFinite(mapRect.width) || !Number.isFinite(mapRect.height) || mapRect.width <= 0 || mapRect.height <= 0) {
      return fallback;
    }

    const getRect = (selector) => {
      const node = wrap.querySelector(selector);
      return node instanceof HTMLElement ? node.getBoundingClientRect() : null;
    };
    const overlapsMap = (rect) => {
      if (!rect) {
        return false;
      }
      return (
        rectIntersectionSpan(mapRect.left, mapRect.right, rect.left, rect.right) > 0 &&
        rectIntersectionSpan(mapRect.top, mapRect.bottom, rect.top, rect.bottom) > 0
      );
    };

    const topDeckRect = getRect(".atlas-top-deck");
    const introRect = getRect(".atlas-figure-intro");
    const searchRect = getRect(".atlas-search-region");
    const themeRect = getRect(".atlas-theme-ribbon");
    const kpiRect = getRect(".atlas-kpi-ribbon--inline");
    const contextRect = getRect(".atlas-context-card");

    let x0 = mapRect.left + FOCUS_RECT_PADDING_PX;
    let y0 = mapRect.top + FOCUS_RECT_PADDING_PX;
    let x1 = mapRect.right - FOCUS_RECT_PADDING_PX;
    let y1 = mapRect.bottom - FOCUS_RECT_PADDING_PX;

    if (viewportTier === "xl") {
      // XL: map can render up to the bottom edge of the KPI/search row.
      const topOccluders = [kpiRect, searchRect].filter(overlapsMap);
      const topBottom = topOccluders.reduce(
        (maxBottom, rect) => Math.max(maxBottom, rect.bottom),
        Number.NEGATIVE_INFINITY
      );
      if (Number.isFinite(topBottom)) {
        y0 = Math.max(y0, topBottom + OCCLUDER_GAP_PX);
      } else if (overlapsMap(introRect)) {
        y0 = Math.max(y0, introRect.bottom + OCCLUDER_GAP_PX);
      }

      // XL: the context panel blocks map visibility; fit to the side opposite the panel.
      if (overlapsMap(contextRect)) {
        const contextCenterX = contextRect.left + contextRect.width / 2;
        const mapCenterX = mapRect.left + mapRect.width / 2;
        if (contextCenterX >= mapCenterX) {
          x1 = Math.min(x1, contextRect.left - OCCLUDER_GAP_PX);
        } else {
          x0 = Math.max(x0, contextRect.right + OCCLUDER_GAP_PX);
        }
      }
    } else if (viewportTier === "l") {
      // L: keep the fit window high so the map isn't pushed too far down.
      y0 = mapRect.top + FOCUS_RECT_PADDING_PX;

      const leftOccluders = [searchRect, themeRect, contextRect].filter(overlapsMap);
      const rightEdgeOfLeftColumn = leftOccluders.reduce((maxRight, rect) => {
        const centerX = rect.left + rect.width / 2;
        if (centerX > mapRect.left + mapRect.width * 0.72) {
          return maxRight;
        }
        return Math.max(maxRight, rect.right);
      }, Number.NEGATIVE_INFINITY);
      if (Number.isFinite(rightEdgeOfLeftColumn)) {
        x0 = Math.max(x0, rightEdgeOfLeftColumn + OCCLUDER_GAP_PX);
      }
    } else if (viewportTier === "m" || viewportTier === "s") {
      x0 = mapRect.left + FOCUS_RECT_PADDING_PX;
      y0 = mapRect.top + FOCUS_RECT_PADDING_PX;
      x1 = mapRect.right - FOCUS_RECT_PADDING_PX;
      y1 = mapRect.bottom - FOCUS_RECT_PADDING_PX;
    }

    if (selectionKind === "country") {
      x0 += 4;
      y0 += 4;
      x1 -= 4;
      y1 -= 4;
    }

    if (x1 - x0 < MIN_FOCUS_RECT_WIDTH_PX || y1 - y0 < MIN_FOCUS_RECT_HEIGHT_PX) {
      return fallback;
    }

    const scaleX = VIEWBOX_WIDTH / mapRect.width;
    const scaleY = VIEWBOX_HEIGHT / mapRect.height;

    return clampFocusRect({
      x0: (x0 - mapRect.left) * scaleX,
      y0: (y0 - mapRect.top) * scaleY,
      x1: (x1 - mapRect.left) * scaleX,
      y1: (y1 - mapRect.top) * scaleY
    });
  }, [viewportTier]);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = 0;
    }
  }, []);

  const markInteracting = useCallback(() => {
    setIsInteracting(true);
    clearSettleTimer();
    settleTimerRef.current = window.setTimeout(() => {
      setIsInteracting(false);
      settleTimerRef.current = 0;
    }, INTERACTION_SETTLE_MS);
  }, [clearSettleTimer]);

  const cancelAnimation = useCallback(() => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
  }, []);

  const applyTransform = useCallback((nextView) => {
    const clamped = clampTransform(nextView);
    viewTransformRef.current = clamped;
    if (mapGroupRef.current) {
      mapGroupRef.current.setAttribute("transform", toTransformString(clamped));
      const labelScaleInverse = clamped.scale >= 1 ? 1 / clamped.scale : 1;
      mapGroupRef.current.style.setProperty("--map-scale-inverse", `${labelScaleInverse}`);
    }
  }, []);

  useEffect(() => {
    const settleAfterResize = (reason) => {
      const session = resizeSessionRef.current;
      const now = performance.now();
      const elapsedMs = session.active ? Math.round(now - session.startedAt) : 0;
      cancelAnimation();
      clearSettleTimer();
      dragStateRef.current = null;
      suppressClickRef.current = false;
      setIsDragging((current) => (current ? false : current));
      setIsInteracting((current) => (current ? false : current));
      setIsResizing((current) => (current ? false : current));
      applyTransform(viewTransformRef.current);
      if (window.innerWidth <= 1280) {
        setLegendCollapsed((current) => (current ? current : true));
      }
      logResize("settled", {
        reason,
        elapsedMs,
        events: session.events,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      });
      setViewportTier((current) => {
        const next = viewportTierForWidth(window.innerWidth);
        return current === next ? current : next;
      });
      setResizeRevision((current) => current + 1);
      session.active = false;
      session.startedAt = 0;
      session.events = 0;
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = 0;
      }
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      resizeEventBurstRef.current = 0;
      if (resizeWatchdogTimerRef.current) {
        window.clearTimeout(resizeWatchdogTimerRef.current);
        resizeWatchdogTimerRef.current = 0;
      }
    };

    const beginResizeSession = () => {
      const session = resizeSessionRef.current;
      if (session.active) {
        return;
      }
      session.active = true;
      session.startedAt = performance.now();
      session.events = 0;
      cancelAnimation();
      clearSettleTimer();
      setIsResizing((current) => (current ? current : true));
      setIsDragging((current) => (current ? false : current));
      setIsInteracting((current) => (current ? false : current));
      logResize("started", {
        viewport: `${window.innerWidth}x${window.innerHeight}`
      });
      resizeWatchdogTimerRef.current = window.setTimeout(() => {
        resizeWatchdogTimerRef.current = 0;
        settleAfterResize("watchdog");
      }, RESIZE_WATCHDOG_MS);
    };

    const onResize = () => {
      resizeEventBurstRef.current += 1;
      if (resizeRafRef.current) {
        return;
      }
      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = 0;
        const burstCount = Math.max(1, resizeEventBurstRef.current);
        resizeEventBurstRef.current = 0;
        beginResizeSession();
        const session = resizeSessionRef.current;
        session.events += burstCount;
        if (session.events % 25 === 0) {
          logResize("pulse", {
            events: session.events,
            elapsedMs: Math.round(performance.now() - session.startedAt)
          });
        }
        if (resizeTimerRef.current) {
          window.clearTimeout(resizeTimerRef.current);
        }
        resizeTimerRef.current = window.setTimeout(() => {
          resizeTimerRef.current = 0;
          settleAfterResize("debounced");
        }, RESIZE_SETTLE_MS);
      });
    };

    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = 0;
      }
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      resizeEventBurstRef.current = 0;
      if (resizeWatchdogTimerRef.current) {
        window.clearTimeout(resizeWatchdogTimerRef.current);
        resizeWatchdogTimerRef.current = 0;
      }
    };
  }, [applyTransform, cancelAnimation, clearSettleTimer, logResize]);

  useEffect(() => {
    if (
      !shouldDebugResize ||
      typeof window === "undefined" ||
      typeof window.PerformanceObserver !== "function"
    ) {
      return undefined;
    }
    const supportedTypes = window.PerformanceObserver.supportedEntryTypes ?? [];
    if (!supportedTypes.includes("longtask")) {
      return undefined;
    }

    const observer = new window.PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration >= 120) {
          logResize("longtask", {
            durationMs: Math.round(entry.duration),
            startedAtMs: Math.round(entry.startTime),
            name: entry.name || "longtask"
          });
        }
      });
    });

    observer.observe({ entryTypes: ["longtask"] });
    return () => observer.disconnect();
  }, [logResize, shouldDebugResize]);

  const animateToTransform = useCallback(
    (targetView, duration = 620) => {
      cancelAnimation();
      clearSettleTimer();

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        applyTransform(targetView);
        setIsInteracting(false);
        return;
      }

      const from = viewTransformRef.current;
      const to = clampTransform(targetView);
      let start = 0;

      setIsInteracting(true);

      const tick = (time) => {
        if (!start) {
          start = time;
        }
        const progress = Math.min(1, (time - start) / duration);
        const eased = easeOutCubic(progress);
        applyTransform(interpolateTransform(from, to, eased));

        if (progress < 1) {
          animationRef.current = window.requestAnimationFrame(tick);
        } else {
          animationRef.current = 0;
          setIsInteracting(false);
        }
      };

      animationRef.current = window.requestAnimationFrame(tick);
    },
    [applyTransform, cancelAnimation, clearSettleTimer]
  );

  useEffect(() => {
    return () => {
      cancelAnimation();
      clearSettleTimer();
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = 0;
      }
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      resizeEventBurstRef.current = 0;
      if (resizeWatchdogTimerRef.current) {
        window.clearTimeout(resizeWatchdogTimerRef.current);
        resizeWatchdogTimerRef.current = 0;
      }
    };
  }, [cancelAnimation, clearSettleTimer]);

  const allPortfolioByIso = useMemo(
    () => Object.fromEntries(allCountries.map((country) => [country.iso3, country])),
    [allCountries]
  );
  const visibleIso = useMemo(() => new Set(visibleCountries.map((country) => country.iso3)), [visibleCountries]);
  const selectableIso = visibleIso;
  const selectedHighlightSet = useMemo(
    () =>
      new Set(
        (selectedHighlightIso ?? [])
          .map((iso3) => String(iso3).trim().toUpperCase())
          .filter(Boolean)
      ),
    [selectedHighlightIso]
  );
  const hoveredHighlightSet = useMemo(
    () =>
      new Set(
        (hoveredHighlightIso ?? [])
          .map((iso3) => String(iso3).trim().toUpperCase())
          .filter(Boolean)
      ),
    [hoveredHighlightIso]
  );
  const hasSelectedHighlightSet = selectedHighlightSet.size > 0;
  const hasHoveredHighlightSet = hoveredHighlightSet.size > 0;

  const baseFeatures = useMemo(() => {
    return (worldCountriesGeo?.features ?? []).filter(
      (feature) => typeof feature.properties?.iso3 === "string"
    );
  }, [worldCountriesGeo]);

  const footprintByIso = useMemo(() => {
    const entries = (worldFootprintGeo?.features ?? []).map((feature) => [feature.properties.iso3, feature]);
    return new Map(entries);
  }, [worldFootprintGeo]);

  const projection = useMemo(() => {
    const projectionFeatures = baseFeatures.length ? baseFeatures : worldFootprintGeo?.features ?? [];
    const fitTarget = projectionFeatures.length
      ? {
          type: "FeatureCollection",
          features: projectionFeatures
        }
      : { type: "Sphere" };
    return geoNaturalEarth1().fitExtent(GLOBAL_FIT_EXTENT, fitTarget);
  }, [baseFeatures, worldFootprintGeo]);

  const path = useMemo(() => geoPath(projection), [projection]);

  const baseFeaturesByIso = useMemo(
    () => new Map(baseFeatures.map((feature) => [feature.properties.iso3, feature])),
    [baseFeatures]
  );

  const globalFeatures = useMemo(() => {
    return visibleCountries
      .map((country) => footprintByIso.get(country.iso3) ?? baseFeaturesByIso.get(country.iso3))
      .filter(Boolean);
  }, [baseFeaturesByIso, footprintByIso, visibleCountries]);

  const regionFeatures = useMemo(() => {
    if (selectedRegion === "global") {
      return [];
    }

    return visibleCountries
      .filter((country) => country.region === selectedRegion)
      .map((country) => footprintByIso.get(country.iso3) ?? baseFeaturesByIso.get(country.iso3))
      .filter(Boolean);
  }, [baseFeaturesByIso, footprintByIso, selectedRegion, visibleCountries]);

  const featureRows = useMemo(
    () =>
      baseFeatures.map((feature) => ({
        iso3: feature.properties.iso3,
        feature,
        pathD: path(feature) ?? undefined
      })),
    [baseFeatures, path]
  );

  const keyboardCountries = useMemo(
    () =>
      baseFeatures
        .filter((feature) => selectableIso.has(feature.properties.iso3))
        .map((feature) => ({
          iso3: feature.properties.iso3,
          name: allPortfolioByIso[feature.properties.iso3]?.name ?? feature.properties.name
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [allPortfolioByIso, baseFeatures, selectableIso]
  );

  useEffect(() => {
    if (!keyboardCountries.length) {
      setKeyboardIso(null);
      return;
    }

    if (selectedIso && keyboardCountries.some((country) => country.iso3 === selectedIso)) {
      setKeyboardIso(selectedIso);
      return;
    }

    if (hoveredIso && keyboardCountries.some((country) => country.iso3 === hoveredIso)) {
      setKeyboardIso(hoveredIso);
      return;
    }

    setKeyboardIso((current) => current ?? keyboardCountries[0].iso3);
  }, [hoveredIso, keyboardCountries, selectedIso]);

  const focusedCountry = keyboardCountries.find((country) => country.iso3 === keyboardIso) ?? null;

  const labels = useMemo(() => {
    const sourceFeatures = (worldFootprintGeo?.features ?? []).filter((feature) =>
      visibleIso.has(feature.properties.iso3)
    );
    return sourceFeatures.map((feature) => {
      const iso3 = feature.properties.iso3;
      const positionOverride = LABEL_POSITION_OVERRIDES[iso3];
      const labelLng = Number(positionOverride?.lng ?? feature.properties.label_lng);
      const labelLat = Number(positionOverride?.lat ?? feature.properties.label_lat);
      const coordinates = Number.isFinite(labelLng) && Number.isFinite(labelLat)
        ? projection([labelLng, labelLat])
        : projection(geoCentroid(feature));

      return {
        iso3,
        name: feature.properties.name,
        projectCount: feature.properties.project_count,
        labelLines:
          LABEL_TEXT_OVERRIDES[iso3] ??
          buildLabelLines(feature.properties.name, Number(feature.properties.project_count) || 0, iso3),
        anchor: positionOverride?.anchor ?? "middle",
        dx: Number(positionOverride?.dx ?? 0),
        dy: Number(positionOverride?.dy ?? 0),
        x: coordinates?.[0] ?? 0,
        y: coordinates?.[1] ?? 0
      };
    });
  }, [projection, visibleIso, worldFootprintGeo]);

  const shownLabels = useMemo(() => {
    if (selectedIso) {
      return labels.filter((label) => label.iso3 === selectedIso);
    }

    const labelPool = hasHoveredHighlightSet
      ? labels.filter((label) => hoveredHighlightSet.has(label.iso3))
      : labels;

    const ordered = [...labelPool].sort((left, right) => {
      const leftProjects = Number(left.projectCount) || 0;
      const rightProjects = Number(right.projectCount) || 0;
      if (rightProjects !== leftProjects) {
        return rightProjects - leftProjects;
      }
      return left.iso3.localeCompare(right.iso3);
    });

    const accepted = [];
    const occupied = [];

    ordered.forEach((label) => {
      const bounds = estimateLabelBounds(label);
      if (occupied.some((existing) => boundsOverlap(existing, bounds))) {
        return;
      }
      accepted.push(label);
      occupied.push(bounds);
    });

    return accepted;
  }, [hasHoveredHighlightSet, hoveredHighlightSet, labels, selectedIso]);

  const renderedLabels = isResizing ? [] : shownLabels;

  const selectedFeatureRow = useMemo(
    () => (selectedIso ? featureRows.find((row) => row.iso3 === selectedIso) ?? null : null),
    [featureRows, selectedIso]
  );

  const hasProtectedAreaData = Boolean(selectedIso && selectedTerritoryGeo?.features?.length);

  const surinameTemplateFeature = useMemo(
    () => baseFeaturesByIso.get("SUR") ?? null,
    [baseFeaturesByIso]
  );

  const templateTerritoryRows = useMemo(() => {
    if (!surinameTemplateFeature) {
      return [];
    }

    const pathD = path(surinameTemplateFeature) ?? undefined;
    return typeof pathD === "string" && pathD.length > 0
      ? [{ id: "sur-template-main", pathD }]
      : [];
  }, [path, surinameTemplateFeature]);

  const templateTerritoryTransform = useMemo(() => {
    if (!hasProtectedAreaData || !selectedFeatureRow?.feature || !templateTerritoryRows.length || !surinameTemplateFeature) {
      return null;
    }

    const [[templateX0, templateY0], [templateX1, templateY1]] = path.bounds(surinameTemplateFeature);
    const [[countryX0, countryY0], [countryX1, countryY1]] = path.bounds(selectedFeatureRow.feature);

    const templateWidth = templateX1 - templateX0;
    const templateHeight = templateY1 - templateY0;
    const countryWidth = countryX1 - countryX0;
    const countryHeight = countryY1 - countryY0;

    if (
      !Number.isFinite(templateWidth) ||
      !Number.isFinite(templateHeight) ||
      !Number.isFinite(countryWidth) ||
      !Number.isFinite(countryHeight) ||
      templateWidth <= 0 ||
      templateHeight <= 0 ||
      countryWidth <= 0 ||
      countryHeight <= 0
    ) {
      return null;
    }

    const targetWidth = countryWidth * TERRITORY_TEMPLATE_TARGET_RATIO;
    const targetHeight = countryHeight * TERRITORY_TEMPLATE_TARGET_RATIO;
    const scale = Math.min(targetWidth / templateWidth, targetHeight / templateHeight);
    if (!Number.isFinite(scale) || scale <= 0) {
      return null;
    }

    const templateCenterX = templateX0 + templateWidth / 2;
    const templateCenterY = templateY0 + templateHeight / 2;
    const countryCenterX = countryX0 + countryWidth / 2;
    const countryCenterY = countryY0 + countryHeight / 2;

    const tx = countryCenterX - scale * templateCenterX;
    const ty = countryCenterY - scale * templateCenterY;
    return `translate(${tx} ${ty}) scale(${scale})`;
  }, [hasProtectedAreaData, path, selectedFeatureRow, surinameTemplateFeature, templateTerritoryRows.length]);

  const fitCoverageFor = useCallback(
    (selectionKind) => {
      if (selectionKind === "country") {
        if (viewportTier === "l") return 0.87;
        if (viewportTier === "m") return 0.9;
        if (viewportTier === "s") return 0.88;
        return 0.9;
      }
      if (selectionKind === "region") {
        if (viewportTier === "l") return 0.95;
        if (viewportTier === "m") return 0.96;
        if (viewportTier === "s") return 0.95;
        return 0.98;
      }
      if (viewportTier === "l") return 0.96;
      if (viewportTier === "m") return 0.97;
      if (viewportTier === "s") return 0.96;
      return 0.99;
    },
    [viewportTier]
  );

  const applyTierBias = useCallback(
    (view, { selectionKind, features, focusRect }) => {
      let next = view;

      if (viewportTier === "l") {
        const globalShiftX = selectionKind === "global" ? L_GLOBAL_SHIFT_X : 0;
        const globalShiftY = selectionKind === "global" ? L_GLOBAL_SHIFT_Y : 0;
        const hasFocusedSelection = selectionKind === "country" || selectionKind === "region";
        const focusShiftX = hasFocusedSelection ? L_FOCUS_SHIFT_X : 0;
        const focusShiftY = hasFocusedSelection ? L_FOCUS_SHIFT_Y : 0;
        next = clampTransform({
          ...next,
          tx: next.tx + L_COMMON_SHIFT_X + globalShiftX + focusShiftX,
          ty: next.ty + L_COMMON_SHIFT_Y + globalShiftY + focusShiftY
        });
      }

      if (viewportTier === "xl" && features?.length) {
        const bounds = collectFeatureBounds(features, path);
        if (bounds) {
          const targetRect = clampFocusRect(focusRect);
          const targetWidth = targetRect.x1 - targetRect.x0;
          const rightThirdStart = targetRect.x1 - targetWidth / 3;
          const targetRight = targetRect.x1 - XL_RIGHT_JUSTIFY_GAP;
          const bboxHalfWidth = ((bounds.maxX - bounds.minX) * next.scale) / 2;
          const worldCenter = ((bounds.minX + bounds.maxX) / 2) * next.scale;
          const rightThirdCenter = rightThirdStart + (targetRight - rightThirdStart) / 2;
          const minInsideCenter = targetRect.x0 + XL_RIGHT_JUSTIFY_GAP + bboxHalfWidth;

          let targetCenter = rightThirdCenter;
          const canFullyFitInsideRightThird = bboxHalfWidth * 2 <= targetRight - rightThirdStart;
          if (canFullyFitInsideRightThird) {
            const minRightThirdCenter = rightThirdStart + bboxHalfWidth;
            const maxRightThirdCenter = targetRight - bboxHalfWidth;
            targetCenter = clamp(rightThirdCenter, minRightThirdCenter, maxRightThirdCenter);
          } else {
            // When too wide for the right third, keep right edge in bounds and bias as far right as possible.
            targetCenter = targetRight - bboxHalfWidth;
          }

          targetCenter = Math.max(targetCenter, minInsideCenter);
          next = clampTransform({
            ...next,
            tx: targetCenter - worldCenter
          });
        }

        if (selectionKind === "country" || selectionKind === "region") {
          next = clampTransform({
            ...next,
            tx: next.tx + XL_FOCUS_SHIFT_X,
            ty: next.ty + XL_FOCUS_SHIFT_Y
          });
        }
      }

      return next;
    },
    [path, viewportTier]
  );

  const fitSelectedIso = useCallback(
    (iso3) => {
      const feature = iso3 ? baseFeaturesByIso.get(iso3) : null;
      const focusRect = getFocusRect("country");
      if (!feature) {
        return IDENTITY_VIEW;
      }
      const fitted = fitTransformForFeature(feature, path, focusRect, fitCoverageFor("country"));
      return applyTierBias(fitted, {
        selectionKind: "country",
        features: [feature],
        focusRect
      });
    },
    [applyTierBias, baseFeaturesByIso, fitCoverageFor, getFocusRect, path]
  );

  const resolveGlobalView = useCallback(() => {
    const focusRect = getFocusRect("global");
    const targetFeatures = globalFeatures.length ? globalFeatures : baseFeatures;
    const fitted = fitTransformForFeatures(targetFeatures, path, focusRect, fitCoverageFor("global"));
    return applyTierBias(fitted, {
      selectionKind: "global",
      features: targetFeatures,
      focusRect
    });
  }, [applyTierBias, baseFeatures, fitCoverageFor, getFocusRect, globalFeatures, path]);

  const resolveRegionView = useCallback(() => {
    if (!regionFeatures.length) {
      return resolveGlobalView();
    }
    const focusRect = getFocusRect("region");
    const fitted = fitTransformForFeatures(regionFeatures, path, focusRect, fitCoverageFor("region"));
    return applyTierBias(fitted, {
      selectionKind: "region",
      features: regionFeatures,
      focusRect
    });
  }, [applyTierBias, fitCoverageFor, getFocusRect, path, regionFeatures, resolveGlobalView]);

  const pickCountryAtClientPoint = useCallback(
    (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY);
      const pathNode = target?.closest?.("path[data-iso3]");
      const iso3 = pathNode?.getAttribute?.("data-iso3");
      if (!iso3) {
        return null;
      }
      const feature = footprintByIso.get(iso3);
      if (!feature || !visibleIso.has(iso3)) {
        return null;
      }
      return iso3;
    },
    [footprintByIso, visibleIso]
  );

  useEffect(() => {
    applyTransform(viewTransformRef.current);
  }, [applyTransform, featureRows]);

  useEffect(() => {
    if (!selectedIso) {
      return;
    }
    const target = fitSelectedIso(selectedIso);
    animateToTransform(target, 680);
  }, [animateToTransform, fitSelectedIso, resizeRevision, selectedIso, viewportTier]);

  useEffect(() => {
    if (selectedIso) {
      return;
    }

    if (selectedRegion === "global") {
      animateToTransform(resolveGlobalView(), 520);
      return;
    }

    animateToTransform(resolveRegionView(), 640);
  }, [
    animateToTransform,
    resolveGlobalView,
    resolveRegionView,
    resizeRevision,
    selectedIso,
    selectedRegion
  ]);

  const zoomBy = useCallback(
    (factor, anchorX = VIEWBOX_WIDTH / 2, anchorY = VIEWBOX_HEIGHT / 2, animate = false) => {
      const next = scaleAroundPoint(viewTransformRef.current, factor, anchorX, anchorY);
      if (animate) {
        animateToTransform(next, 260);
      } else {
        applyTransform(next);
        markInteracting();
      }
    },
    [animateToTransform, applyTransform, markInteracting]
  );

  const handleResetView = useCallback(() => {
    onClearSelection();
    animateToTransform(resolveGlobalView(), 420);
  }, [animateToTransform, onClearSelection, resolveGlobalView]);

  const handleWrapClickCapture = useCallback(
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("path[data-iso3]")) {
        return;
      }

      if (target.closest("svg.map-canvas")) {
        return;
      }

      if (target.closest("button, input, select, textarea, a, summary, [role='button']")) {
        return;
      }

      if (target.closest(".atlas-context-card")) {
        return;
      }

      if (target.closest(".map-legend")) {
        return;
      }

      handleResetView();
    },
    [handleResetView]
  );

  const handleWheel = useCallback(
    (event) => {
      if (window.innerWidth <= 980) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }

      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomBy(factor, x, y, false);
    },
    [zoomBy]
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return () => {};
    }

    const onWheel = (event) => {
      handleWheel(event);
    };

    svg.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      svg.removeEventListener("wheel", onWheel);
    };
  }, [handleWheel]);

  const handlePointerDown = useCallback(
    (event) => {
      if (event.pointerType === "touch" || event.button !== 0) {
        return;
      }
      event.preventDefault();

      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      cancelAnimation();
      const rect = svg.getBoundingClientRect();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
        height: rect.height,
        startTransform: { ...viewTransformRef.current }
      };
      suppressClickRef.current = false;
      svg.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setIsInteracting(true);
    },
    [cancelAnimation]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const dxPx = event.clientX - drag.startX;
      const dyPx = event.clientY - drag.startY;

      if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD) {
        suppressClickRef.current = true;
      }

      const dx = (dxPx / drag.width) * VIEWBOX_WIDTH;
      const dy = (dyPx / drag.height) * VIEWBOX_HEIGHT;

      applyTransform({
        scale: drag.startTransform.scale,
        tx: drag.startTransform.tx + dx,
        ty: drag.startTransform.ty + dy
      });
      markInteracting();
    },
    [applyTransform, markInteracting]
  );

  const handlePointerEnd = useCallback(
    (event) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const svg = svgRef.current;
      if (svg && svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }

      dragStateRef.current = null;
      setIsDragging(false);
      if (!suppressClickRef.current) {
        const iso3 = pickCountryAtClientPoint(event.clientX, event.clientY);
        if (iso3) {
          onCountrySelect(iso3);
        } else {
          handleResetView();
        }
      }
      suppressClickRef.current = false;
      onCountryHover(null);
      markInteracting();
    },
    [handleResetView, markInteracting, onCountryHover, onCountrySelect, pickCountryAtClientPoint]
  );

  const stepKeyboardFocus = (direction) => {
    if (!keyboardCountries.length) return;
    const currentIndex = keyboardIso
      ? keyboardCountries.findIndex((country) => country.iso3 === keyboardIso)
      : 0;
    const nextIndex = (currentIndex + direction + keyboardCountries.length) % keyboardCountries.length;
    setKeyboardIso(keyboardCountries[nextIndex].iso3);
  };

  const handleMapKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleResetView();
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.2, VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2, true);
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(1 / 1.2, VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2, true);
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      handleResetView();
      return;
    }

    if (!keyboardCountries.length) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      stepKeyboardFocus(1);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      stepKeyboardFocus(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setKeyboardIso(keyboardCountries[0].iso3);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setKeyboardIso(keyboardCountries[keyboardCountries.length - 1].iso3);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && keyboardIso) {
      event.preventDefault();
      onCountrySelect(keyboardIso);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`map-wrap map-wrap--page23 map-wrap--tier-${viewportTier}${isDragging ? " is-dragging" : ""}${isInteracting ? " is-interacting" : ""}${isResizing ? " is-resizing" : ""}`}
      tabIndex={0}
      onKeyDown={handleMapKeyDown}
      onClickCapture={handleWrapClickCapture}
      aria-label="Interactive world map"
    >
      <svg
        ref={svgRef}
        className="map-canvas"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        aria-label="Interactive world map"
        role="application"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={() => onCountryHover(null)}
      >
        <defs>
          <pattern id={patternIds.additional2024} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(135)">
            <rect width="8" height="8" fill={PAGE23_STATUS_STYLE.additional_2024.fill} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(247,241,228,0.95)" strokeWidth="2" />
          </pattern>
          <pattern id={patternIds.firstTime2024} patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill={PAGE23_STATUS_STYLE.first_time_2024.fill} />
            <circle cx="2" cy="2" r="1.2" fill="rgba(247,241,228,0.95)" />
            <circle cx="6" cy="6" r="1.2" fill="rgba(247,241,228,0.95)" />
          </pattern>
          <pattern id={patternIds.selectedDash} patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="rgba(114, 162, 218, 0.2)" />
            <path
              d="M-8 8 L8 -8 M-4 12 L12 -4 M0 16 L16 0"
              stroke="rgba(18, 76, 148, 0.52)"
              strokeWidth="0.72"
              strokeDasharray="2 1.5"
              strokeLinecap="square"
            />
            <path
              d="M-8 0 L8 16 M-12 4 L4 20 M-4 -4 L12 12"
              stroke="rgba(41, 108, 186, 0.42)"
              strokeWidth="0.6"
              strokeDasharray="1.6 1.2"
              strokeLinecap="square"
            />
            <path
              d="M0 0H8 M0 4H8 M0 8H8 M0 0V8 M4 0V8 M8 0V8"
              stroke="rgba(27, 88, 160, 0.24)"
              strokeWidth="0.34"
            />
          </pattern>
          {selectedFeatureRow?.pathD ? (
            <clipPath id={patternIds.selectedClip}>
              <path d={selectedFeatureRow.pathD} />
            </clipPath>
          ) : null}
        </defs>

        <g ref={mapGroupRef} className="map-group" transform={toTransformString(viewTransformRef.current)}>
          {featureRows.map(({ iso3, feature, pathD }) => {
            const footprintFeature = footprintByIso.get(iso3);
            const isPortfolioCountry = Boolean(footprintFeature);
            const isVisibleCountry = visibleIso.has(iso3);
            const isSelected = iso3 === selectedIso;
            const isFocused = iso3 === hoveredIso;
            const isStrongHighlighted = isPortfolioCountry && isVisibleCountry && selectedHighlightSet.has(iso3);
            const isSoftHighlighted =
              isPortfolioCountry &&
              isVisibleCountry &&
              !isStrongHighlighted &&
              hoveredHighlightSet.has(iso3);
            const shouldDimForStrongSet = hasSelectedHighlightSet && !selectedIso;
            const shouldDimForSoftSet = !hasSelectedHighlightSet && hasHoveredHighlightSet && !selectedIso;

            let fill = "#F1EFE8";
            let stroke = "rgba(190, 194, 187, 0.78)";
            let fillOpacity = 1;
            let strokeOpacity = 0.72;
            let strokeWidth = 0.6;

            if (isPortfolioCountry && !isVisibleCountry) {
              fill = "#DAD7CD";
              stroke = "rgba(153, 158, 150, 0.9)";
              strokeWidth = 0.72;
            }

            if (isPortfolioCountry && isVisibleCountry) {
              fill = getStatusFill(footprintFeature.properties.status, patternIds);
              stroke = isFocused || isSelected ? "#0E3941" : "#F6EFE0";
              fillOpacity = 0.96;
              strokeWidth = isFocused || isSelected ? 1.6 : 0.95;
              strokeOpacity = 0.95;
            }

            if (isPortfolioCountry && isVisibleCountry && isSoftHighlighted) {
              fillOpacity = 0.98;
              stroke = "#0A4B55";
              strokeWidth = 1.46;
              strokeOpacity = 0.96;
            }

            if (isPortfolioCountry && isVisibleCountry && isStrongHighlighted) {
              fillOpacity = 1;
              stroke = "#072f37";
              strokeWidth = 1.92;
              strokeOpacity = 1;
            }

            if (shouldDimForStrongSet && isPortfolioCountry && isVisibleCountry && !isStrongHighlighted) {
              fillOpacity = 0.3;
              stroke = "rgba(124, 132, 126, 0.88)";
              strokeWidth = 0.66;
              strokeOpacity = 0.5;
            }

            if (shouldDimForSoftSet && isPortfolioCountry && isVisibleCountry && !isSoftHighlighted) {
              fillOpacity = 0.62;
              stroke = "rgba(124, 132, 126, 0.88)";
              strokeWidth = 0.76;
              strokeOpacity = 0.66;
            }

            if (selectedIso && !isSelected) {
              fillOpacity = isPortfolioCountry && isVisibleCountry ? 0.26 : 0.22;
              strokeOpacity = isPortfolioCountry ? 0.42 : 0.34;
              stroke = "rgba(124, 132, 126, 0.86)";
              strokeWidth = isPortfolioCountry ? 0.6 : 0.54;
            }

            if (isSelected) {
              fillOpacity = 1;
              stroke = "#072f37";
              strokeWidth = 2;
              strokeOpacity = 1;
            }

            return (
              <path
                key={iso3}
                data-iso3={iso3}
                className={`map-country${isPortfolioCountry && isVisibleCountry ? " map-country--selectable" : ""}`}
                d={pathD}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={
                  isPortfolioCountry && isVisibleCountry && !isDragging
                    ? () => onCountryHover(iso3)
                    : undefined
                }
                onMouseLeave={
                  isPortfolioCountry && isVisibleCountry && !isDragging
                    ? () => onCountryHover(null)
                    : undefined
                }
              >
                <title>
                  {feature.properties.name}
                  {isPortfolioCountry
                    ? isVisibleCountry
                      ? " (Portfolio country)"
                      : " (Portfolio country, currently outside active filter)"
                    : " (No Tenure Facility project in 2024 portfolio)"}
                </title>
              </path>
            );
          })}

          {selectedFeatureRow?.pathD && hasProtectedAreaData && templateTerritoryRows.length && templateTerritoryTransform ? (
            <g
              className="map-selected-territories"
              clipPath={`url(#${patternIds.selectedClip})`}
            >
              <g transform={templateTerritoryTransform}>
                {templateTerritoryRows.map((territory) => (
                  <path
                    key={`${selectedIso}-${territory.id}`}
                    d={territory.pathD}
                    fill={`url(#${patternIds.selectedDash})`}
                    fillOpacity={0.88}
                    stroke="rgba(24, 89, 162, 0.92)"
                    strokeWidth={0.7}
                    strokeDasharray="4 2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            </g>
          ) : null}

          {selectedFeatureRow?.pathD ? (
            <path
              d={selectedFeatureRow.pathD}
              className="map-selected-country-halo"
              fill="none"
              stroke="#F4E5C7"
              strokeWidth={2.8}
              strokeOpacity={0.82}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : null}

          {renderedLabels.map((label) => (
            <text
              key={`${label.iso3}-label`}
              x={label.x + label.dx}
              y={label.y + label.dy}
              textAnchor={label.anchor}
              fill="#0F3F47"
              fontWeight="700"
              letterSpacing="0.02em"
              stroke="#F5EFE1"
              paintOrder="stroke"
              style={{
                fontSize: "calc(var(--map-label-base, 9.8px) * var(--map-scale-inverse, 1))",
                strokeWidth: "calc(var(--map-label-stroke, 1.3px) * var(--map-scale-inverse, 1))"
              }}
              fillOpacity={selectedIso && label.iso3 !== selectedIso ? 0.34 : 1}
              pointerEvents="none"
            >
              {label.labelLines.map((line, index) => (
                <tspan key={`${label.iso3}-line-${index}`} x={label.x + label.dx} dy={index === 0 ? 0 : "1.04em"}>
                  {line}
                </tspan>
              ))}
            </text>
          ))}
        </g>
      </svg>

      {overlay}

      <div className={`map-legend-stack${legendCollapsed ? " is-collapsed" : ""}`}>
        <div className="map-nav-tools" aria-label="Map navigation controls">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.2, VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2, true)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.2, VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2, true)}
          >
            -
          </button>
        </div>

        <div
          className={`map-legend${legendCollapsed ? " is-collapsed" : ""}`}
          aria-label="Map legend"
          onMouseLeave={() => onStatusHover(null)}
        >
          {legendCollapsed ? (
            <button
              type="button"
              className="map-legend__collapsed-toggle"
              aria-expanded="false"
              onClick={() => setLegendCollapsed(false)}
            >
              Legend
            </button>
          ) : (
            <>
              <div className="map-legend__top">
                <strong>How to read this map</strong>
                <button
                  type="button"
                  className="map-legend__toggle"
                  aria-expanded="true"
                  onClick={() => {
                    onStatusHover(null);
                    setLegendCollapsed(true);
                  }}
                >
                  Hide
                </button>
              </div>
              <p className="map-legend__note">In the 2024 portfolio:</p>
              <ul>
                {statusDefinitions.map((status) => (
                  <li
                    key={status.id}
                    className={[
                      selectedStatusId === status.id ? "is-active" : "",
                      hoveredStatusId === status.id ? "is-hovered" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="map-legend__item-button"
                      aria-pressed={selectedStatusId === status.id}
                      onClick={() => onStatusSelect(status.id)}
                      onMouseEnter={() => onStatusHover(status.id)}
                      onMouseLeave={() => onStatusHover(null)}
                    >
                      <span className="swatch" style={getLegendSwatchStyle(status.id)} aria-hidden="true" />
                      <span>{getConciseLegendLabel(status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {selectedIso
          ? `Zoomed to ${allPortfolioByIso[selectedIso]?.name ?? selectedIso}.`
          : focusedCountry
            ? `Map focus is ${focusedCountry.name}.`
            : "No focused country."}
      </p>
    </div>
  );
}
