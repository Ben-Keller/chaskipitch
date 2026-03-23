import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CONTENT_ROOT = path.join(ROOT, "content");
const CONTENT_COUNTRIES_DIR = path.join(CONTENT_ROOT, "countries");
const CONTENT_GEO_DIR = path.join(CONTENT_ROOT, "geo");
const SOURCE_GEO_DIR = path.join(ROOT, "geo");
const MANIFEST_PATH = path.join(SOURCE_GEO_DIR, "countries_manifest.json");

function toFixedNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Number(value.toFixed(8));
}

function pointsEqual(first, second, epsilon = 1e-9) {
  return (
    Math.abs(first[0] - second[0]) <= epsilon &&
    Math.abs(first[1] - second[1]) <= epsilon
  );
}

function ensureRingClosed(ring) {
  if (!ring.length) {
    return ring;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (pointsEqual(first, last)) {
    return ring;
  }
  return [...ring, [first[0], first[1]]];
}

function createArcDecoder(topology) {
  const rawArcs = topology.arcs;
  const transform = topology.transform;
  const cache = new Map();

  const decodeArcByIndex = (index) => {
    if (cache.has(index)) {
      return cache.get(index);
    }

    const arc = rawArcs[index];
    if (!Array.isArray(arc)) {
      throw new Error(`Invalid arc index ${index} in topology.`);
    }

    const hasTransform = Boolean(transform?.scale && transform?.translate);
    let x = 0;
    let y = 0;

    const decoded = arc.map((pair) => {
      if (hasTransform) {
        x += pair[0];
        y += pair[1];
        return [
          toFixedNumber(x * transform.scale[0] + transform.translate[0]),
          toFixedNumber(y * transform.scale[1] + transform.translate[1])
        ];
      }
      return [toFixedNumber(pair[0]), toFixedNumber(pair[1])];
    });

    cache.set(index, decoded);
    return decoded;
  };

  return (rawArcIndex) => {
    const reversed = rawArcIndex < 0;
    const arcIndex = reversed ? ~rawArcIndex : rawArcIndex;
    const decoded = decodeArcByIndex(arcIndex).map((point) => [point[0], point[1]]);
    return reversed ? decoded.reverse() : decoded;
  };
}

function stitchArcs(decodeArc, arcIndices) {
  const coordinates = [];

  arcIndices.forEach((arcIndex, idx) => {
    const arcCoords = decodeArc(arcIndex);
    if (idx === 0) {
      coordinates.push(...arcCoords);
      return;
    }
    coordinates.push(...arcCoords.slice(1));
  });

  return ensureRingClosed(coordinates);
}

function toGeoJSONGeometry(geometry, decodeArc) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.arcs.map((ring) => stitchArcs(decodeArc, ring))
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.arcs.map((polygon) => polygon.map((ring) => stitchArcs(decodeArc, ring)))
    };
  }

  return null;
}

function topologyObjectToFeatures(topology, objectName) {
  const object = topology.objects?.[objectName];
  if (!object) {
    throw new Error(`Topology object "${objectName}" not found.`);
  }

  const decodeArc = createArcDecoder(topology);

  if (object.type === "GeometryCollection") {
    return object.geometries
      .map((geometry, index) => {
        const geo = toGeoJSONGeometry(geometry, decodeArc);
        if (!geo) {
          return null;
        }
        return {
          type: "Feature",
          id: geometry.id ?? `feature_${index}`,
          properties: geometry.properties ?? {},
          geometry: geo
        };
      })
      .filter(Boolean);
  }

  const geo = toGeoJSONGeometry(object, decodeArc);
  if (!geo) {
    return [];
  }

  return [
    {
      type: "Feature",
      id: object.id ?? "feature_0",
      properties: object.properties ?? {},
      geometry: geo
    }
  ];
}

function flattenPolygons(geometry) {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return [];
}

function mergeCountryGeometry(features, iso3) {
  const polygons = [];

  features.forEach((feature) => {
    polygons.push(...flattenPolygons(feature.geometry));
  });

  if (!polygons.length) {
    throw new Error(`No polygon geometry found for ${iso3}.`);
  }

  if (polygons.length === 1) {
    return {
      type: "Polygon",
      coordinates: polygons[0]
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons
  };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

function layerSortByPriority(manifestCountries) {
  return (left, right) => {
    const leftOrder = manifestCountries[left.properties.iso3]?.draw_order ?? 9999;
    const rightOrder = manifestCountries[right.properties.iso3]?.draw_order ?? 9999;
    return leftOrder - rightOrder;
  };
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const manifestCountries = manifest.countries ?? {};
  const manifestEntries = Object.entries(manifestCountries).sort((left, right) => {
    const leftOrder = left[1]?.draw_order ?? 9999;
    const rightOrder = right[1]?.draw_order ?? 9999;
    return leftOrder - rightOrder;
  });
  const countryFiles = (await fs.readdir(CONTENT_COUNTRIES_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const geometryByIso = new Map();
  const worldCountryFeatures = [];
  const worldFeatures = [];
  const missingFromManifest = [];
  const missingTopologyForWorld = [];

  for (const [iso3, manifestEntry] of manifestEntries) {
    if (!manifestEntry?.file) {
      continue;
    }

    const topologyPath = path.join(SOURCE_GEO_DIR, manifestEntry.file);
    const objectName = manifestEntry.object || manifest.topo_object_default || "data";

    try {
      const topology = await readJson(topologyPath);
      const topoFeatures = topologyObjectToFeatures(topology, objectName);
      const mergedGeometry = mergeCountryGeometry(topoFeatures, iso3);
      const firstProperties = topoFeatures[0]?.properties ?? {};
      const labelPoint = Array.isArray(manifestEntry.label_point)
        ? manifestEntry.label_point
        : manifestEntry.bbox_center;
      const displayName =
        firstProperties.nam_en ||
        firstProperties.name ||
        firstProperties.NAME ||
        firstProperties.admin ||
        firstProperties.iso3cd ||
        iso3;

      geometryByIso.set(iso3, {
        geometry: mergedGeometry,
        label_lng: toFixedNumber(labelPoint?.[0] ?? 0),
        label_lat: toFixedNumber(labelPoint?.[1] ?? 0),
        display_name: displayName
      });

      worldCountryFeatures.push({
        type: "Feature",
        properties: {
          iso3,
          name: displayName,
          status: "outside_portfolio",
          project_count: 0,
          label_lng: toFixedNumber(labelPoint?.[0] ?? 0),
          label_lat: toFixedNumber(labelPoint?.[1] ?? 0),
          geometry_quality: "authoritative",
          geometry_source: "geo/countries_manifest.json + geo/countries_topojson/*.topo.json"
        },
        geometry: mergedGeometry
      });
    } catch {
      missingTopologyForWorld.push(iso3);
    }
  }

  for (const file of countryFiles) {
    const filePath = path.join(CONTENT_COUNTRIES_DIR, file);
    const country = await readJson(filePath);
    const iso3 = country.iso3;
    const manifestEntry = manifestCountries[iso3];

    const geometryRecord = geometryByIso.get(iso3);
    if (!manifestEntry?.file || !geometryRecord) {
      missingFromManifest.push(iso3);
      continue;
    }

    const mergedGeometry = geometryRecord.geometry;

    const featureProperties = {
      iso3,
      name: country.name,
      status: country.status,
      project_count: country.project_count,
      label_lng: geometryRecord.label_lng,
      label_lat: geometryRecord.label_lat,
      geometry_quality: "authoritative",
      geometry_source: "geo/countries_manifest.json + geo/countries_topojson/*.topo.json"
    };

    worldFeatures.push({
      type: "Feature",
      properties: featureProperties,
      geometry: mergedGeometry
    });

    const boundaryFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            iso3,
            name: country.name,
            layer: "boundary",
            geometry_quality: "authoritative",
            geometry_source: "geo/countries_manifest.json + geo/countries_topojson/*.topo.json"
          },
          geometry: mergedGeometry
        }
      ]
    };

    await writeJson(path.join(CONTENT_GEO_DIR, iso3, "boundary.geojson"), boundaryFeatureCollection);

    country.geo_layers = Array.from(new Set([...(country.geo_layers ?? []), "boundary", "territories"]));
    country.geo_ref = {
      ...country.geo_ref,
      country_layers: Array.from(
        new Set([...(country.geo_ref?.country_layers ?? []), "boundary", "territories"])
      ),
      geometry_quality: "mixed",
      geometry_source:
        "Country boundaries are authoritative from geo/countries_manifest.json; project territory layers are supplemental GeoJSON prepared outside the PDF."
    };

    await writeJson(filePath, country);
  }

  worldFeatures.sort(layerSortByPriority(manifestCountries));

  const worldFeatureCollection = {
    type: "FeatureCollection",
    features: worldFeatures
  };
  const worldCountriesFeatureCollection = {
    type: "FeatureCollection",
    features: worldCountryFeatures
  };

  const outputWorldPath = path.join(CONTENT_GEO_DIR, "world-footprint.geojson");
  const outputWorldCountriesPath = path.join(CONTENT_GEO_DIR, "world-countries.geojson");
  await writeJson(outputWorldPath, worldFeatureCollection);
  await writeJson(outputWorldCountriesPath, worldCountriesFeatureCollection);

  const provenance = {
    version: "phase3.authoritative-world.1",
    input: {
      manifest: "geo/countries_manifest.json",
      topo_dir: manifest.paths?.topo_dir ?? "geo/countries_topojson",
      world_fit_geojson: manifest.paths?.world_fit_geojson ?? "geo/world_fit.geojson",
      manifest_version: manifest.version ?? "unknown",
      crs: manifest.crs ?? "EPSG:4326"
    },
    output: {
      world_footprint: "content/geo/world-footprint.geojson",
      world_countries: "content/geo/world-countries.geojson",
      country_boundary_layer: "content/geo/<ISO3>/boundary.geojson",
      world_feature_count: worldFeatures.length,
      world_country_feature_count: worldCountryFeatures.length
    },
    warnings: {
      missing_countries_in_manifest: missingFromManifest,
      missing_topology_for_world: missingTopologyForWorld
    }
  };

  await writeJson(path.join(CONTENT_GEO_DIR, "authoritative-provenance.json"), provenance);

  console.log("Authoritative geospatial build complete.");
  console.log(`- World footprint features: ${worldFeatures.length}`);
  console.log(`- World country features: ${worldCountryFeatures.length}`);
  console.log(`- Country boundary files updated: ${worldFeatures.length}`);
  console.log(`- Missing manifest entries: ${missingFromManifest.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
