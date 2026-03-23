"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import maplibregl, { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { CountryContent, GeoFeatureCollection, GlobalContent } from "@/lib/types";
import { CloudTransition } from "@/components/cloud-transition";

interface GlobalMapProps {
  countries: CountryContent[];
  worldGeo: GeoFeatureCollection;
  statusDefinitions: GlobalContent["status_definitions"];
  onCountrySelect: (iso3: string) => void;
  highlightedIso?: string;
}

function getBoundsFromPolygon(coordinates: number[][][] | number[][][][]): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;

    if (
      coords.length === 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      bounds.extend([coords[0], coords[1]]);
      return;
    }

    coords.forEach((value) => visit(value));
  };

  visit(coordinates);
  return bounds;
}

function waitForMoveEnd(map: MapLibreMap, fallbackMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;

    const complete = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      map.off("moveend", onMoveEnd);
      resolve();
    };

    const onMoveEnd = () => complete();
    const timeout = window.setTimeout(complete, fallbackMs);

    map.once("moveend", onMoveEnd);
  });
}

async function runCinematicZoom(
  map: MapLibreMap,
  bounds: maplibregl.LngLatBounds,
  options: { isMobile: boolean; reducedMotion: boolean }
): Promise<void> {
  const fitPadding = options.isMobile ? 48 : 86;

  if (options.reducedMotion) {
    map.fitBounds(bounds, { padding: fitPadding, duration: options.isMobile ? 420 : 620, essential: true });
    await waitForMoveEnd(map, options.isMobile ? 520 : 780);
    return;
  }

  const cameraForBounds = map.cameraForBounds(bounds, { padding: fitPadding });
  const boundsCenter = bounds.getCenter();
  const settleZoom = Math.min(cameraForBounds?.zoom ?? 5.2, options.isMobile ? 5.05 : 5.9);
  const bridgeZoom = Math.max(settleZoom - (options.isMobile ? 0.55 : 0.95), options.isMobile ? 2.55 : 2.2);

  map.easeTo({
    center: [boundsCenter.lng, boundsCenter.lat],
    zoom: bridgeZoom,
    pitch: options.isMobile ? 0 : 28,
    bearing: options.isMobile ? 0 : 11,
    duration: options.isMobile ? 420 : 900,
    essential: true,
    easing: (t) => 1 - Math.pow(1 - t, 3)
  });
  await waitForMoveEnd(map, options.isMobile ? 620 : 1250);

  map.easeTo({
    center: [boundsCenter.lng, boundsCenter.lat],
    zoom: settleZoom,
    pitch: 0,
    bearing: 0,
    duration: options.isMobile ? 380 : 860,
    essential: true,
    easing: (t) => t * t * (3 - 2 * t)
  });
  await waitForMoveEnd(map, options.isMobile ? 620 : 1200);
}

export function GlobalMap({
  countries,
  worldGeo,
  statusDefinitions,
  onCountrySelect,
  highlightedIso
}: GlobalMapProps) {
  type WorldFeature = GeoFeatureCollection["features"][number];

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onCountrySelectRef = useRef(onCountrySelect);
  const statusColorMapRef = useRef<Record<string, string>>({});
  const triggerCountrySelectionRef = useRef<(iso3: string) => void>(() => {});
  const transitionLockRef = useRef(false);
  const [transitionIso, setTransitionIso] = useState<string | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<"approach" | "descend">("approach");
  const [keyboardIso, setKeyboardIso] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  const visibleIso = useMemo(() => new Set(countries.map((country) => country.iso3)), [countries]);

  const filteredGeo = useMemo<GeoFeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: worldGeo.features.filter(
        (feature) => typeof feature.properties.iso3 === "string" && visibleIso.has(feature.properties.iso3)
      )
    }),
    [worldGeo, visibleIso]
  );

  const labelGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filteredGeo.features
        .map((feature) => {
          const labelLng = Number(feature.properties.label_lng);
          const labelLat = Number(feature.properties.label_lat);
          if (!Number.isFinite(labelLng) || !Number.isFinite(labelLat)) {
            return null;
          }

          return {
            type: "Feature" as const,
            properties: {
              iso3: feature.properties.iso3,
              name: feature.properties.name,
              project_count: feature.properties.project_count
            },
            geometry: {
              type: "Point" as const,
              coordinates: [labelLng, labelLat]
            }
          };
        })
        .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))
    }),
    [filteredGeo]
  );

  const statusColorMap = useMemo(
    () => Object.fromEntries(statusDefinitions.map((definition) => [definition.id, definition.color])),
    [statusDefinitions]
  );

  const featureByIso = useMemo<Record<string, WorldFeature>>(
    () =>
      Object.fromEntries(
        filteredGeo.features
          .filter((feature) => typeof feature.properties.iso3 === "string")
          .map((feature) => [feature.properties.iso3 as string, feature])
      ),
    [filteredGeo.features]
  );

  const keyboardCountries = useMemo(
    () =>
      Object.values(featureByIso)
        .map((feature) => ({
          iso3: feature.properties.iso3 as string,
          name: (feature.properties.name as string) ?? (feature.properties.iso3 as string)
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [featureByIso]
  );

  const focusedCountry = useMemo(
    () => keyboardCountries.find((country) => country.iso3 === keyboardIso) ?? null,
    [keyboardCountries, keyboardIso]
  );

  const focusCountryOnMap = useCallback(
    (iso3: string) => {
      const map = mapRef.current;
      const feature = featureByIso[iso3];
      if (!map || !feature || transitionLockRef.current) {
        return;
      }

      const geometry = feature.geometry;
      if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const bounds = getBoundsFromPolygon(geometry.coordinates as number[][][] | number[][][][]);
      map.fitBounds(bounds, { padding: window.innerWidth < 760 ? 56 : 86, duration: reducedMotion ? 0 : 560, essential: true });
    },
    [featureByIso]
  );

  const triggerCountrySelection = useCallback(
    (iso3: string) => {
      const map = mapRef.current;
      const feature = featureByIso[iso3];

      if (!map || !feature || transitionLockRef.current) {
        return;
      }

      const geometry = feature.geometry;
      if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
        return;
      }

      const bounds = getBoundsFromPolygon(geometry.coordinates as number[][][] | number[][][][]);
      const isMobile = window.innerWidth < 760;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      transitionLockRef.current = true;
      setKeyboardIso(iso3);

      if (!reducedMotion) {
        setTransitionIso(iso3);
        setTransitionPhase("approach");
      }

      if (!isMobile && !reducedMotion) {
        window.setTimeout(() => {
          setTransitionPhase("descend");
        }, 420);
      } else if (!reducedMotion) {
        setTransitionPhase("descend");
      }

      void (async () => {
        await runCinematicZoom(map, bounds, { isMobile, reducedMotion });

        if (reducedMotion) {
          transitionLockRef.current = false;
          onCountrySelectRef.current(iso3);
          return;
        }

        window.setTimeout(() => {
          setTransitionIso(null);
          transitionLockRef.current = false;
          onCountrySelectRef.current(iso3);
        }, isMobile ? 360 : 520);
      })();
    },
    [featureByIso]
  );

  const stepKeyboardFocus = useCallback(
    (direction: 1 | -1) => {
      if (!keyboardCountries.length) {
        return;
      }

      const currentIndex = keyboardIso
        ? keyboardCountries.findIndex((country) => country.iso3 === keyboardIso)
        : -1;
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + keyboardCountries.length) % keyboardCountries.length;
      const nextIso = keyboardCountries[nextIndex].iso3;

      setKeyboardIso(nextIso);
      focusCountryOnMap(nextIso);
    },
    [focusCountryOnMap, keyboardCountries, keyboardIso]
  );

  const handleMapKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!keyboardCountries.length) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
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
        const firstIso = keyboardCountries[0].iso3;
        setKeyboardIso(firstIso);
        focusCountryOnMap(firstIso);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        const lastIso = keyboardCountries[keyboardCountries.length - 1].iso3;
        setKeyboardIso(lastIso);
        focusCountryOnMap(lastIso);
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && keyboardIso) {
        event.preventDefault();
        triggerCountrySelectionRef.current(keyboardIso);
      }
    },
    [focusCountryOnMap, keyboardCountries, keyboardIso, stepKeyboardFocus]
  );

  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect;
  }, [onCountrySelect]);

  useEffect(() => {
    statusColorMapRef.current = statusColorMap;
  }, [statusColorMap]);

  useEffect(() => {
    triggerCountrySelectionRef.current = triggerCountrySelection;
  }, [triggerCountrySelection]);

  useEffect(() => {
    if (!keyboardCountries.length) {
      setKeyboardIso(null);
      return;
    }

    if (highlightedIso && keyboardCountries.some((country) => country.iso3 === highlightedIso)) {
      setKeyboardIso((current) => (current === highlightedIso ? current : highlightedIso));
      return;
    }

    setKeyboardIso((current) => {
      if (current && keyboardCountries.some((country) => country.iso3 === current)) {
        return current;
      }
      return keyboardCountries[0].iso3;
    });
  }, [highlightedIso, keyboardCountries]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.innerWidth < 760) {
      setLegendCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [8, 9],
      zoom: 1.45,
      maxZoom: 7,
      minZoom: 1.1,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      setMapReady(true);

      map.addSource("tenure-countries", {
        type: "geojson",
        data: filteredGeo
      });

      map.addSource("tenure-label-points", {
        type: "geojson",
        data: labelGeo as unknown as any
      });

      map.addLayer({
        id: "tenure-fill",
        type: "fill",
        source: "tenure-countries",
        paint: {
          "fill-color": [
            "match",
            ["get", "status"],
            "active",
            statusColorMapRef.current.active ?? "#2A8C7A",
            "additional_2024",
            statusColorMapRef.current.additional_2024 ?? "#E08D49",
            "first_time_2024",
            statusColorMapRef.current.first_time_2024 ?? "#C35745",
            "preparing",
            statusColorMapRef.current.preparing ?? "#C8A96A",
            "under_assessment",
            statusColorMapRef.current.under_assessment ?? "#70807A",
            "#60766f"
          ],
          "fill-opacity": 0.78
        }
      });

      map.addLayer({
        id: "tenure-outline",
        type: "line",
        source: "tenure-countries",
        paint: {
          "line-color": "#153f39",
          "line-width": 1.2,
          "line-opacity": 0.88
        }
      });

      map.addLayer({
        id: "tenure-focus-outline",
        type: "line",
        source: "tenure-countries",
        filter: ["==", ["get", "iso3"], ""],
        paint: {
          "line-color": "#f6e9cf",
          "line-width": 2.8,
          "line-opacity": 0.95
        }
      });

      map.addLayer({
        id: "tenure-labels",
        type: "symbol",
        source: "tenure-label-points",
        layout: {
          "text-field": [
            "format",
            ["get", "name"],
            { "text-font": ["Open Sans Semibold"] },
            "\n",
            {},
            ["concat", "Projects: ", ["to-string", ["get", "project_count"]]],
            { "font-scale": 0.8 }
          ],
          "text-size": 11,
          "text-max-width": 8,
          "text-offset": [0, 0],
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#0f2d29",
          "text-halo-color": "#f4ead5",
          "text-halo-width": 1
        }
      });

      map.on("mouseenter", "tenure-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "tenure-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "tenure-fill", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const iso3 = feature?.properties?.iso3 as string | undefined;

        if (!iso3 || transitionLockRef.current) {
          return;
        }

        triggerCountrySelectionRef.current(iso3);
      });
    });

    mapRef.current = map;

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const countriesSource = map.getSource("tenure-countries") as GeoJSONSource | undefined;
    if (countriesSource) {
      countriesSource.setData(filteredGeo as unknown as any);
    }

    const labelsSource = map.getSource("tenure-label-points") as GeoJSONSource | undefined;
    if (labelsSource) {
      labelsSource.setData(labelGeo as unknown as any);
    }
  }, [filteredGeo, labelGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getLayer("tenure-focus-outline")) {
      return;
    }

    const focusIso = keyboardIso ?? highlightedIso ?? "";
    map.setFilter("tenure-focus-outline", ["==", ["get", "iso3"], focusIso]);
  }, [highlightedIso, keyboardIso, mapReady]);

  useEffect(() => {
    if (!highlightedIso || !mapRef.current) return;

    const feature = filteredGeo.features.find((item) => item.properties.iso3 === highlightedIso);
    if (!feature) return;

    const geometry = feature.geometry;
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      const bounds = getBoundsFromPolygon(geometry.coordinates as number[][][] | number[][][][]);
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 1200 });
    }
  }, [filteredGeo, highlightedIso]);

  return (
    <div
      className="map-wrap"
      tabIndex={0}
      onKeyDown={handleMapKeyDown}
      aria-label="World map. Use arrow keys to cycle countries and Enter to open country details."
    >
      <div className="map-canvas" ref={mapNodeRef} aria-label="Interactive world map" role="application" />
      <div className="map-atlas-vignette" aria-hidden="true" />
      <div className="map-haze map-haze--north" aria-hidden="true" />
      <div className="map-haze map-haze--south" aria-hidden="true" />
      <CloudTransition active={Boolean(transitionIso)} phase={transitionPhase} />
      <div className="map-legend" aria-label="Map legend">
        <div className="map-legend__top">
          <strong>Implementation status</strong>
          <button
            type="button"
            className="map-legend__toggle"
            aria-expanded={!legendCollapsed}
            onClick={() => setLegendCollapsed((value) => !value)}
          >
            {legendCollapsed ? "Show" : "Hide"}
          </button>
        </div>
        {!legendCollapsed ? (
          <>
            <ul>
              {statusDefinitions.map((status) => (
                <li key={status.id}>
                  <span className="swatch" style={{ background: status.color }} aria-hidden="true" />
                  <span>{status.label}</span>
                </li>
              ))}
            </ul>
            <div className="map-keyboard-hint">
              <span>
                Keyboard map: arrows to move, Enter to open.
                {focusedCountry ? ` Focused: ${focusedCountry.name}.` : ""}
              </span>
            </div>
            <div className="map-keyboard-controls" aria-label="Keyboard map controls">
              <button type="button" onClick={() => stepKeyboardFocus(-1)}>
                Previous
              </button>
              <button type="button" onClick={() => stepKeyboardFocus(1)}>
                Next
              </button>
              <button
                type="button"
                onClick={() => {
                  if (keyboardIso) {
                    triggerCountrySelectionRef.current(keyboardIso);
                  }
                }}
                disabled={!keyboardIso}
              >
                Open
              </button>
            </div>
          </>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {focusedCountry ? `Map focus is ${focusedCountry.name}. Press Enter to open.` : "No focused country."}
      </p>
    </div>
  );
}
