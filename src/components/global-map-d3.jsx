import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { geoCentroid, geoNaturalEarth1, geoPath } from "d3";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 560;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const GLOBAL_FIT_EXTENT = [
  [-8, 34],
  [VIEWBOX_WIDTH - 18, VIEWBOX_HEIGHT - 6]
];
const REGION_ZOOM_OUT_FACTOR = 1 / 1.2;
const REGION_DOWN_SHIFT_PX = 32;
const INTERACTION_SETTLE_MS = 170;
const DRAG_THRESHOLD = 6;
const IDENTITY_VIEW = { scale: 1, tx: 0, ty: 0 };

const PAGE23_STATUS_STYLE = {
  active: { fill: "#D35E4B", legend: "solid" },
  additional_2024: { fill: "#D35E4B", legend: "diagonal" },
  first_time_2024: { fill: "#D35E4B", legend: "dotted" },
  preparing: { fill: "#EFC56E", legend: "solid" },
  under_assessment: { fill: "#0D7A78", legend: "solid" }
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

function clampTransform(view) {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const minTx = VIEWBOX_WIDTH - VIEWBOX_WIDTH * scale;
  const minTy = VIEWBOX_HEIGHT - VIEWBOX_HEIGHT * scale;
  return {
    scale,
    tx: clamp(view.tx, minTx, 0),
    ty: clamp(view.ty, minTy, 0)
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

function fitTransformForFeature(feature, path) {
  if (!feature) {
    return IDENTITY_VIEW;
  }

  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const dx = Math.max(1, x1 - x0);
  const dy = Math.max(1, y1 - y0);
  const scale = clamp(0.82 / Math.max(dx / VIEWBOX_WIDTH, dy / VIEWBOX_HEIGHT), MIN_SCALE, MAX_SCALE);

  return clampTransform({
    scale,
    tx: VIEWBOX_WIDTH / 2 - scale * ((x0 + x1) / 2),
    ty: VIEWBOX_HEIGHT / 2 - scale * ((y0 + y1) / 2)
  });
}

function fitTransformForFeatures(features, path) {
  if (!features?.length) {
    return IDENTITY_VIEW;
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
    return IDENTITY_VIEW;
  }

  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);
  const scale = clamp(0.84 / Math.max(dx / VIEWBOX_WIDTH, dy / VIEWBOX_HEIGHT), MIN_SCALE, MAX_SCALE);

  return clampTransform({
    scale,
    tx: VIEWBOX_WIDTH / 2 - scale * ((minX + maxX) / 2),
    ty: VIEWBOX_HEIGHT / 2 - scale * ((minY + maxY) / 2)
  });
}

export function GlobalMapD3({
  allCountries = [],
  visibleCountries = [],
  selectedRegion = "global",
  worldFootprintGeo = { type: "FeatureCollection", features: [] },
  worldCountriesGeo = { type: "FeatureCollection", features: [] },
  statusDefinitions = [],
  selectedIso = null,
  selectedTerritoryGeo = null,
  onCountrySelect = () => {},
  onClearSelection = () => {},
  highlightedIso = null,
  overlay = null
}) {
  const patternPrefix = useId().replaceAll(":", "");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [keyboardIso, setKeyboardIso] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  const svgRef = useRef(null);
  const mapGroupRef = useRef(null);
  const viewTransformRef = useRef(IDENTITY_VIEW);
  const animationRef = useRef(0);
  const settleTimerRef = useRef(0);
  const dragStateRef = useRef(null);
  const suppressClickRef = useRef(false);

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
    if (window.innerWidth < 760) {
      setLegendCollapsed(true);
    }
  }, []);

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
      mapGroupRef.current.style.setProperty("--map-scale-inverse", `${1 / clamped.scale}`);
    }
  }, []);

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
    };
  }, [cancelAnimation, clearSettleTimer]);

  const allPortfolioByIso = useMemo(
    () => Object.fromEntries(allCountries.map((country) => [country.iso3, country])),
    [allCountries]
  );
  const visibleIso = useMemo(() => new Set(visibleCountries.map((country) => country.iso3)), [visibleCountries]);
  const selectableIso = visibleIso;

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

  const regionFeatures = useMemo(() => {
    if (selectedRegion === "global") {
      return [];
    }

    return allCountries
      .filter((country) => country.region === selectedRegion)
      .map((country) => footprintByIso.get(country.iso3) ?? baseFeaturesByIso.get(country.iso3))
      .filter(Boolean);
  }, [allCountries, baseFeaturesByIso, footprintByIso, selectedRegion]);

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

    if (highlightedIso && keyboardCountries.some((country) => country.iso3 === highlightedIso)) {
      setKeyboardIso(highlightedIso);
      return;
    }

    setKeyboardIso((current) => current ?? keyboardCountries[0].iso3);
  }, [highlightedIso, keyboardCountries, selectedIso]);

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

    const ordered = [...labels].sort((left, right) => {
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
  }, [labels, selectedIso]);

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

    const targetWidth = countryWidth * 0.34;
    const targetHeight = countryHeight * 0.34;
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

  const fitSelectedIso = useCallback(
    (iso3) => {
      const feature = iso3 ? baseFeaturesByIso.get(iso3) : null;
      return feature ? fitTransformForFeature(feature, path) : IDENTITY_VIEW;
    },
    [baseFeaturesByIso, path]
  );

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
    const target = fitSelectedIso(selectedIso);
    animateToTransform(target, 680);
  }, [animateToTransform, fitSelectedIso, selectedIso]);

  useEffect(() => {
    if (selectedIso) {
      return;
    }

    if (selectedRegion === "global") {
      animateToTransform(IDENTITY_VIEW, 520);
      return;
    }

    const fittedRegion = fitTransformForFeatures(regionFeatures, path);
    const zoomedOut = scaleAroundPoint(
      fittedRegion,
      REGION_ZOOM_OUT_FACTOR,
      VIEWBOX_WIDTH / 2,
      VIEWBOX_HEIGHT / 2
    );
    const target = clampTransform({
      ...zoomedOut,
      ty: zoomedOut.ty + REGION_DOWN_SHIFT_PX
    });
    animateToTransform(target, 640);
  }, [animateToTransform, path, regionFeatures, selectedIso, selectedRegion]);

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
    animateToTransform(IDENTITY_VIEW, 420);
  }, [animateToTransform, onClearSelection]);

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
      if (window.innerWidth < 760) {
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
      markInteracting();
    },
    [handleResetView, markInteracting, onCountrySelect, pickCountryAtClientPoint]
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
      className={`map-wrap map-wrap--page23${isDragging ? " is-dragging" : ""}${isInteracting ? " is-interacting" : ""}`}
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
            const isFocused = iso3 === (keyboardIso ?? highlightedIso);

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

          {shownLabels.map((label) => (
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
                fontSize: "calc(9.5px * var(--map-scale-inverse, 1))",
                strokeWidth: "calc(1.3px * var(--map-scale-inverse, 1))"
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

      <div className="map-legend-stack">
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

        <div className={`map-legend${legendCollapsed ? " is-collapsed" : ""}`} aria-label="Map legend">
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
                  onClick={() => setLegendCollapsed(true)}
                >
                  Hide
                </button>
              </div>
              <ul>
                {statusDefinitions.map((status) => (
                  <li key={status.id}>
                    <span className="swatch" style={getLegendSwatchStyle(status.id)} aria-hidden="true" />
                    <span>{status.label}</span>
                  </li>
                ))}
                <li>
                  <span className="swatch" style={{ background: "#ECEBE3", border: "1px solid rgba(170, 176, 170, 0.86)" }} aria-hidden="true" />
                  <span>Other countries (no 2024 portfolio project)</span>
                </li>
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
