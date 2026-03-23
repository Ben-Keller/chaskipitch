"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import maplibregl, { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { GeoFeatureCollection } from "@/lib/types";

interface CountryMapProps {
  boundaryGeo: GeoFeatureCollection | null;
  territoryGeo: GeoFeatureCollection | null;
}

interface FocusableFeature {
  label: string;
  feature: GeoFeatureCollection["features"][number];
}

function getBounds(features: GeoFeatureCollection["features"]) {
  const bounds = new maplibregl.LngLatBounds();

  const visit = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) {
      return;
    }

    if (
      coordinates.length === 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      bounds.extend([coordinates[0], coordinates[1]]);
      return;
    }

    coordinates.forEach((coord) => visit(coord));
  };

  features.forEach((feature) => visit(feature.geometry.coordinates));
  return bounds;
}

const EMPTY_COLLECTION: GeoFeatureCollection = {
  type: "FeatureCollection",
  features: []
};

function getBestFitGeo(boundaryGeo: GeoFeatureCollection | null, territoryGeo: GeoFeatureCollection | null) {
  if (territoryGeo?.features?.length) {
    return territoryGeo;
  }
  return boundaryGeo;
}

function getFeatureLabel(feature: GeoFeatureCollection["features"][number], index: number): string {
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

function findMatchingFeatureIndex(
  features: FocusableFeature[],
  properties: Record<string, unknown> | undefined
): number {
  if (!properties) {
    return -1;
  }

  const name = typeof properties.name === "string" ? properties.name : null;
  const iso3 = typeof properties.iso3 === "string" ? properties.iso3 : null;
  const layer = typeof properties.layer === "string" ? properties.layer : null;

  if (name) {
    const byName = features.findIndex((item) => item.feature.properties.name === name);
    if (byName >= 0) {
      return byName;
    }
  }

  if (iso3 && layer) {
    const byIsoLayer = features.findIndex(
      (item) => item.feature.properties.iso3 === iso3 && item.feature.properties.layer === layer
    );
    if (byIsoLayer >= 0) {
      return byIsoLayer;
    }
  }

  if (iso3) {
    return features.findIndex((item) => item.feature.properties.iso3 === iso3);
  }

  return -1;
}

export function CountryMap({ boundaryGeo, territoryGeo }: CountryMapProps) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const focusableFeaturesRef = useRef<FocusableFeature[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [focusedFeatureIndex, setFocusedFeatureIndex] = useState(0);

  const focusableFeatures = useMemo<FocusableFeature[]>(() => {
    const territories = territoryGeo?.features ?? [];
    if (territories.length) {
      return territories.map((feature, index) => ({
        label: getFeatureLabel(feature, index),
        feature
      }));
    }

    const boundaries = boundaryGeo?.features ?? [];
    return boundaries.map((feature, index) => ({
      label: getFeatureLabel(feature, index),
      feature
    }));
  }, [boundaryGeo, territoryGeo]);

  const focusedFeature = focusableFeatures[focusedFeatureIndex] ?? null;

  const focusFeatureGeo = useMemo<GeoFeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: focusedFeature ? [focusedFeature.feature] : []
    }),
    [focusedFeature]
  );

  const fitFeatureOnMap = useCallback((feature: GeoFeatureCollection["features"][number], duration = 640) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const bounds = getBounds([feature]);
    if (bounds.isEmpty()) {
      return;
    }

    map.fitBounds(bounds, { padding: window.innerWidth < 760 ? 44 : 56, duration, essential: true });
  }, []);

  const stepFocusedFeature = useCallback(
    (direction: 1 | -1) => {
      if (!focusableFeatures.length) {
        return;
      }

      setFocusedFeatureIndex((current) => {
        const next = (current + direction + focusableFeatures.length) % focusableFeatures.length;
        return next;
      });
    },
    [focusableFeatures.length]
  );

  const handleMapKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && focusedFeature) {
        event.preventDefault();
        fitFeatureOnMap(focusedFeature.feature, 520);
      }
    },
    [fitFeatureOnMap, focusableFeatures, focusedFeature, stepFocusedFeature]
  );

  useEffect(() => {
    focusableFeaturesRef.current = focusableFeatures;
  }, [focusableFeatures]);

  useEffect(() => {
    if (!focusableFeatures.length) {
      setFocusedFeatureIndex(0);
      return;
    }

    setFocusedFeatureIndex((current) => Math.min(current, focusableFeatures.length - 1));
  }, [focusableFeatures]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNode.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [0, 0],
      zoom: 3,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      setMapReady(true);

      map.addSource("boundary", {
        type: "geojson",
        data: (boundaryGeo ?? EMPTY_COLLECTION) as unknown as any
      });

      map.addSource("territories", {
        type: "geojson",
        data: (territoryGeo ?? EMPTY_COLLECTION) as unknown as any
      });

      map.addSource("focus-target", {
        type: "geojson",
        data: focusFeatureGeo as unknown as any
      });

      map.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary",
        paint: {
          "fill-color": "#243f37",
          "fill-opacity": 0.28
        }
      });

      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: {
          "line-color": "#d8e9e3",
          "line-width": 1.2,
          "line-opacity": 0.85
        }
      });

      map.addLayer({
        id: "territories-fill",
        type: "fill",
        source: "territories",
        paint: {
          "fill-color": "#53b5a4",
          "fill-opacity": 0.46
        }
      });

      map.addLayer({
        id: "territories-line",
        type: "line",
        source: "territories",
        paint: {
          "line-color": "#9de4d8",
          "line-width": 1.3
        }
      });

      map.addLayer({
        id: "focus-target-fill",
        type: "fill",
        source: "focus-target",
        paint: {
          "fill-color": "#f4e6c7",
          "fill-opacity": 0.16
        }
      });

      map.addLayer({
        id: "focus-target-line",
        type: "line",
        source: "focus-target",
        paint: {
          "line-color": "#f8eed9",
          "line-width": 2.4,
          "line-opacity": 0.95
        }
      });

      const updateFocusFromClick = (event: MapLayerMouseEvent) => {
        const clickedFeature = event.features?.[0];
        const nextIndex = findMatchingFeatureIndex(
          focusableFeaturesRef.current,
          clickedFeature?.properties as Record<string, unknown> | undefined
        );

        if (nextIndex >= 0) {
          setFocusedFeatureIndex(nextIndex);
          return;
        }

        if (focusableFeaturesRef.current.length === 1) {
          setFocusedFeatureIndex(0);
        }
      };

      map.on("click", "territories-fill", updateFocusFromClick);
      map.on("click", "boundary-fill", updateFocusFromClick);

      const displayGeo = getBestFitGeo(boundaryGeo, territoryGeo);
      if (displayGeo?.features?.length) {
        const bounds = getBounds(displayGeo.features);
        map.fitBounds(bounds, { padding: 45, duration: 700 });
      }
    });

    mapRef.current = map;

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [boundaryGeo, focusFeatureGeo, territoryGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const boundarySource = map.getSource("boundary") as GeoJSONSource | undefined;
    if (boundarySource) {
      boundarySource.setData((boundaryGeo ?? EMPTY_COLLECTION) as unknown as any);
    }

    const source = map.getSource("territories") as GeoJSONSource | undefined;
    if (source) {
      source.setData((territoryGeo ?? EMPTY_COLLECTION) as unknown as any);
    }

    const displayGeo = getBestFitGeo(boundaryGeo, territoryGeo);
    if (displayGeo?.features?.length) {
      const bounds = getBounds(displayGeo.features);
      map.fitBounds(bounds, { padding: 45, duration: 800 });
    }
  }, [boundaryGeo, territoryGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.isStyleLoaded()) {
      return;
    }

    const focusSource = map.getSource("focus-target") as GeoJSONSource | undefined;
    if (focusSource) {
      focusSource.setData(focusFeatureGeo as unknown as any);
    }
  }, [focusFeatureGeo, mapReady]);

  useEffect(() => {
    if (!mapReady || !focusedFeature) {
      return;
    }

    fitFeatureOnMap(focusedFeature.feature);
  }, [fitFeatureOnMap, focusedFeature, mapReady]);

  return (
    <div className="country-map-shell">
      <div
        className="map-wrap"
        style={{ minHeight: 320 }}
        ref={mapNode}
        tabIndex={0}
        onKeyDown={handleMapKeyDown}
        aria-label="Country geography map. Use arrows to cycle overlay areas and Enter to focus."
      />
      <div className="country-map-controls" aria-label="Country map controls">
        <span className="country-map-focus-label">
          Focused area: {focusedFeature?.label ?? "No mapped area available"}
        </span>
        <div className="country-map-controls__buttons">
          <button type="button" onClick={() => stepFocusedFeature(-1)} disabled={!focusableFeatures.length}>
            Previous area
          </button>
          <button type="button" onClick={() => stepFocusedFeature(1)} disabled={!focusableFeatures.length}>
            Next area
          </button>
          <button
            type="button"
            onClick={() => {
              if (focusedFeature) {
                fitFeatureOnMap(focusedFeature.feature, 520);
              }
            }}
            disabled={!focusedFeature}
          >
            Refocus map
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {focusedFeature
          ? `Focused overlay is ${focusedFeature.label}. Press Enter to refocus the map.`
          : "No mapped overlay available."}
      </p>
    </div>
  );
}
