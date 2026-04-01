import { contentPath, withBasePath } from "./paths";
const cache = new Map();

const FALLBACK_COUNTRY_CODES = [
  "BFA",
  "BLZ",
  "BOL",
  "BRA",
  "CMR",
  "COD",
  "COG",
  "COL",
  "ECU",
  "GTM",
  "GUY",
  "IDN",
  "IND",
  "KEN",
  "KHM",
  "LBR",
  "MLI",
  "MMR",
  "NPL",
  "PAN",
  "PER",
  "SUR"
];

const FALLBACK_THEME_SLUGS = [
  "climate-biodiversity",
  "community-led-finance",
  "learning-exchange",
  "policy-advocacy",
  "technology-mapping",
  "tenure-security",
  "territorial-governance",
  "women-youth-leadership"
];

async function fetchJson(path) {
  if (cache.has(path)) {
    return cache.get(path);
  }

  const request = fetch(path)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
      }
      return response.json();
    })
    .catch((error) => {
      // Allow retry after transient fetch failures.
      cache.delete(path);
      throw error;
    });

  cache.set(path, request);
  return request;
}

export function getGlobalContent() {
  return fetchJson(contentPath("global.json"));
}

export async function getContentManifest() {
  try {
    return await fetchJson(contentPath("manifest.json"));
  } catch {
    return {
      countries: FALLBACK_COUNTRY_CODES,
      themes: FALLBACK_THEME_SLUGS,
      charts: []
    };
  }
}

async function listFromManifest(key, fallbackValues) {
  const manifest = await getContentManifest();
  const values = manifest?.[key];
  if (!Array.isArray(values) || !values.length) {
    return fallbackValues;
  }
  return values;
}

export async function getCountries() {
  const countryCodes = await listFromManifest("countries", FALLBACK_COUNTRY_CODES);
  return Promise.all(countryCodes.map((iso3) => fetchJson(contentPath(`countries/${iso3}.json`)))).then(
    (countries) => countries.sort((a, b) => a.name.localeCompare(b.name))
  );
}

export async function getCountryByIso(iso3) {
  const normalized = String(iso3 || "").toUpperCase();
  try {
    return await fetchJson(contentPath(`countries/${normalized}.json`));
  } catch {
    return null;
  }
}

export async function getThemes() {
  const themeSlugs = await listFromManifest("themes", FALLBACK_THEME_SLUGS);
  return Promise.all(themeSlugs.map((slug) => fetchJson(contentPath(`themes/${slug}.json`)))).then((themes) =>
    themes.sort((a, b) => a.name.localeCompare(b.name))
  );
}

export async function getThemeBySlug(slug) {
  try {
    return await fetchJson(contentPath(`themes/${slug}.json`));
  } catch {
    return null;
  }
}

export function getMediaIndex() {
  return fetchJson(contentPath("media/index.json"));
}

export function getQuotes() {
  return fetchJson(contentPath("media/quotes.json"));
}

export function getPhotoAssignments() {
  return fetchJson(contentPath("media/photo-assignments.json"));
}

export function getCountryVideoIndex() {
  return fetchJson(contentPath("media/country-videos.json"));
}

export function getCreativePitchStory() {
  return fetchJson(withBasePath("runtime/creative-pitch/story.json"));
}

export function getWorldGeo() {
  return fetchJson(contentPath("geo/world-footprint.geojson"));
}

export function getWorldCountriesGeo() {
  return fetchJson(contentPath("geo/world-countries.geojson"));
}

export async function getCountryGeo(iso3, layer = "territories") {
  try {
    return await fetchJson(contentPath(`geo/${String(iso3).toUpperCase()}/${layer}.geojson`));
  } catch {
    return null;
  }
}

export async function getCountrySignalsIndex() {
  try {
    return await fetchJson(contentPath("signals/index.json"));
  } catch {
    return null;
  }
}

export async function getCountrySignalsByIso(iso3) {
  try {
    return await fetchJson(contentPath(`signals/${String(iso3).toUpperCase()}.json`));
  } catch {
    return null;
  }
}

export async function getCountryEvidenceByIso(iso3) {
  try {
    return await fetchJson(contentPath(`evidence/${String(iso3).toUpperCase()}.json`));
  } catch {
    return null;
  }
}
