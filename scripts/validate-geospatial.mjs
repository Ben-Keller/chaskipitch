import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");
const COUNTRIES_DIR = path.join(CONTENT, "countries");
const GEO_DIR = path.join(CONTENT, "geo");
const WORLD_FOOTPRINT_PATH = path.join(GEO_DIR, "world-footprint.geojson");
const WORLD_COUNTRIES_PATH = path.join(GEO_DIR, "world-countries.geojson");
const PROVENANCE_PATH = path.join(GEO_DIR, "authoritative-provenance.json");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

function collectCoordinates(coordinates, sink) {
  if (!Array.isArray(coordinates)) {
    return;
  }
  if (
    coordinates.length === 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    sink.push(coordinates);
    return;
  }
  coordinates.forEach((item) => collectCoordinates(item, sink));
}

function validateCoordinateRange(coords, fileHint, errors) {
  coords.forEach((pair, index) => {
    const [lng, lat] = pair;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      errors.push(`${fileHint}: coordinate #${index} is not finite`);
      return;
    }
    if (lng < -180 || lng > 180) {
      errors.push(`${fileHint}: longitude out of range (${lng})`);
    }
    if (lat < -90 || lat > 90) {
      errors.push(`${fileHint}: latitude out of range (${lat})`);
    }
  });
}

function validateFeatureGeometry(feature, fileHint, errors) {
  if (!feature?.geometry) {
    errors.push(`${fileHint}: feature missing geometry`);
    return;
  }
  if (!["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
    errors.push(`${fileHint}: unsupported geometry type ${feature.geometry.type}`);
    return;
  }
  const coords = [];
  collectCoordinates(feature.geometry.coordinates, coords);
  if (!coords.length) {
    errors.push(`${fileHint}: geometry has no coordinates`);
    return;
  }
  validateCoordinateRange(coords, fileHint, errors);
}

async function main() {
  const errors = [];
  const warnings = [];

  const countryFiles = (await fs.readdir(COUNTRIES_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const countries = await Promise.all(
    countryFiles.map(async (file) => readJson(path.join(COUNTRIES_DIR, file)))
  );

  const countryIsoSet = new Set(countries.map((country) => country.iso3));

  const worldFootprint = await readJson(WORLD_FOOTPRINT_PATH);
  if (worldFootprint.type !== "FeatureCollection") {
    errors.push("content/geo/world-footprint.geojson is not a FeatureCollection");
  }

  const worldFeatures = Array.isArray(worldFootprint.features) ? worldFootprint.features : [];
  if (worldFeatures.length !== countries.length) {
    errors.push(
      `world footprint feature count ${worldFeatures.length} does not match country count ${countries.length}`
    );
  }

  try {
    const worldCountries = await readJson(WORLD_COUNTRIES_PATH);
    if (worldCountries.type !== "FeatureCollection") {
      errors.push("content/geo/world-countries.geojson is not a FeatureCollection");
    }
    const worldCountryFeatures = Array.isArray(worldCountries.features) ? worldCountries.features : [];
    if (worldCountryFeatures.length < worldFeatures.length) {
      errors.push(
        `world countries feature count ${worldCountryFeatures.length} is smaller than world footprint count ${worldFeatures.length}`
      );
    }
  } catch {
    errors.push(`Missing world countries file: ${WORLD_COUNTRIES_PATH}`);
  }

  const seenIso = new Set();
  worldFeatures.forEach((feature, index) => {
    const hint = `content/geo/world-footprint.geojson feature ${index}`;
    const iso3 = feature?.properties?.iso3;

    if (typeof iso3 !== "string") {
      errors.push(`${hint}: missing iso3 property`);
      return;
    }

    if (!countryIsoSet.has(iso3)) {
      warnings.push(`${hint}: iso3 ${iso3} is not in content/countries`);
    }

    if (seenIso.has(iso3)) {
      errors.push(`${hint}: duplicate iso3 ${iso3}`);
    }
    seenIso.add(iso3);

    const requiredProps = ["name", "status", "project_count", "label_lng", "label_lat"];
    requiredProps.forEach((key) => {
      if (feature.properties[key] === undefined) {
        errors.push(`${hint}: missing property ${key}`);
      }
    });

    validateFeatureGeometry(feature, hint, errors);
  });

  for (const country of countries) {
    const boundaryPath = path.join(GEO_DIR, country.iso3, "boundary.geojson");
    try {
      const boundary = await readJson(boundaryPath);
      const features = Array.isArray(boundary.features) ? boundary.features : [];
      if (!features.length) {
        errors.push(`${boundaryPath}: no features found`);
      }
      features.forEach((feature, index) =>
        validateFeatureGeometry(feature, `${boundaryPath} feature ${index}`, errors)
      );
    } catch {
      errors.push(`Missing boundary file for ${country.iso3}: ${boundaryPath}`);
    }

    if (!country.geo_layers?.includes("boundary")) {
      errors.push(`content/countries/${country.iso3}.json missing geo_layers boundary`);
    }

    if (!country.geo_ref?.country_layers?.includes("boundary")) {
      errors.push(`content/countries/${country.iso3}.json missing geo_ref.country_layers boundary`);
    }

    if (country.geo_ref?.geometry_quality === "placeholder") {
      warnings.push(`content/countries/${country.iso3}.json still marked placeholder geometry quality`);
    }
  }

  try {
    const provenance = await readJson(PROVENANCE_PATH);
    if (provenance?.input?.crs && provenance.input.crs !== "EPSG:4326") {
      warnings.push(`Unexpected CRS in provenance: ${provenance.input.crs}`);
    }
  } catch {
    warnings.push("Missing content/geo/authoritative-provenance.json");
  }

  console.log("Geospatial validation summary");
  console.log(`- Countries: ${countries.length}`);
  console.log(`- World footprint features: ${worldFeatures.length}`);
  console.log(`- Warnings: ${warnings.length}`);
  warnings.forEach((warning) => console.log(`  WARN: ${warning}`));

  if (errors.length) {
    console.log(`- Errors: ${errors.length}`);
    errors.forEach((error) => console.log(`  ERROR: ${error}`));
    throw new Error("Geospatial validation failed");
  }

  console.log("Geospatial validation passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
