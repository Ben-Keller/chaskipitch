import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3";

const VIEWBOX_WIDTH = 960;
const VIEWBOX_HEIGHT = 520;

function featureCollection(features) {
  return {
    type: "FeatureCollection",
    features
  };
}

function getFeatureLabel(feature, index) {
  const name = feature.properties.name;
  if (typeof name === "string" && name.trim()) {
    return name;
  }

  const iso3 = feature.properties.iso3;
  if (typeof iso3 === "string" && iso3.trim()) {
    return `${iso3} boundary`;
  }

  return `Area ${index + 1}`;
}

export function CountryMapD3({ boundaryGeo, territoryGeo }) {
  const [focusedFeatureIndex, setFocusedFeatureIndex] = useState(0);

  const focusableFeatures = useMemo(() => {
    const territories = territoryGeo?.features ?? [];
    if (territories.length) {
      return territories.map((feature, index) => ({
        label: getFeatureLabel(feature, index),
        feature,
        layer: "territory"
      }));
    }

    const boundaries = boundaryGeo?.features ?? [];
    return boundaries.map((feature, index) => ({
      label: getFeatureLabel(feature, index),
      feature,
      layer: "boundary"
    }));
  }, [boundaryGeo, territoryGeo]);

  useEffect(() => {
    if (!focusableFeatures.length) {
      setFocusedFeatureIndex(0);
      return;
    }

    setFocusedFeatureIndex((current) => Math.min(current, focusableFeatures.length - 1));
  }, [focusableFeatures]);

  const focusedFeature = focusableFeatures[focusedFeatureIndex]?.feature ?? null;

  const projection = useMemo(() => {
    const fitGeo = territoryGeo?.features?.length
      ? territoryGeo
      : boundaryGeo?.features?.length
        ? boundaryGeo
        : featureCollection([]);

    return geoMercator().fitExtent(
      [
        [16, 16],
        [VIEWBOX_WIDTH - 16, VIEWBOX_HEIGHT - 16]
      ],
      fitGeo
    );
  }, [boundaryGeo, territoryGeo]);

  const path = useMemo(() => geoPath(projection), [projection]);

  const stepFocusedFeature = (direction) => {
    if (!focusableFeatures.length) {
      return;
    }

    setFocusedFeatureIndex((current) => {
      return (current + direction + focusableFeatures.length) % focusableFeatures.length;
    });
  };

  const handleMapKeyDown = (event) => {
    if (!focusableFeatures.length || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      stepFocusedFeature(1);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      stepFocusedFeature(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setFocusedFeatureIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setFocusedFeatureIndex(focusableFeatures.length - 1);
    }
  };

  return (
    <div
      className="country-map"
      tabIndex={0}
      onKeyDown={handleMapKeyDown}
      role="application"
      aria-label="Country map with territory overlays. Use arrows to cycle mapped areas."
    >
      <svg className="country-map__canvas" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
        <g>
          {(boundaryGeo?.features ?? []).map((feature, index) => (
            <path
              key={`boundary-${index}`}
              d={path(feature) ?? undefined}
              fill="#243f37"
              fillOpacity={0.28}
              stroke="#d8e9e3"
              strokeWidth={1.2}
              strokeOpacity={0.85}
            />
          ))}

          {(territoryGeo?.features ?? []).map((feature, index) => (
            <path
              key={`territory-${index}`}
              d={path(feature) ?? undefined}
              fill="#53b5a4"
              fillOpacity={0.46}
              stroke="#9de4d8"
              strokeWidth={1.3}
              onMouseEnter={() => {
                if (focusableFeatures.length) {
                  setFocusedFeatureIndex(index);
                }
              }}
            />
          ))}

          {focusedFeature ? (
            <path
              d={path(focusedFeature) ?? undefined}
              fill="#f4e6c7"
              fillOpacity={0.16}
              stroke="#f8eed9"
              strokeWidth={2.4}
            />
          ) : null}
        </g>
      </svg>

      <div className="map-keyboard-controls" aria-label="Country map controls" style={{ marginTop: "0.6rem" }}>
        <button type="button" onClick={() => stepFocusedFeature(-1)} disabled={!focusableFeatures.length}>
          Previous area
        </button>
        <button type="button" onClick={() => stepFocusedFeature(1)} disabled={!focusableFeatures.length}>
          Next area
        </button>
      </div>

      <p className="note" style={{ marginTop: "0.5rem", color: "rgba(243,232,210,0.8)" }} aria-live="polite">
        {focusableFeatures.length
          ? `Focused area: ${focusableFeatures[focusedFeatureIndex]?.label}.`
          : "No mapped areas available for this country yet."}
      </p>
    </div>
  );
}
