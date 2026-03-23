import { contentPath } from "./paths";
const cache = new Map();

const CHART_SLUGS = [
  "impact-growth-2023-2024",
  "evolution-grants-projects",
  "funding-flow-2024",
  "funding-milestones-2024",
  "institutional-development-2024",
  "learning-exchanges-2024",
  "mapping-and-tech-kpis-2024",
  "policy-and-advocacy-highlights-2024",
  "tenure-footprint-regional",
  "territorial-governance-kpis-2024",
  "womens-leadership-highlights-2024"
];

async function fetchJson(path) {
  if (cache.has(path)) {
    return cache.get(path);
  }

  const request = fetch(path).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  });

  cache.set(path, request);
  return request;
}

export function getGlobalContent() {
  return fetchJson(contentPath("global.json"));
}

export function getCountries() {
  return Promise.all(
    [
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
    ].map((iso3) => fetchJson(contentPath(`countries/${iso3}.json`)))
  ).then((countries) => countries.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function getCountryByIso(iso3) {
  const normalized = String(iso3 || "").toUpperCase();
  try {
    return await fetchJson(contentPath(`countries/${normalized}.json`));
  } catch {
    return null;
  }
}

export function getThemes() {
  return Promise.all(
    [
      "climate-biodiversity",
      "community-led-finance",
      "learning-exchange",
      "policy-advocacy",
      "technology-mapping",
      "tenure-security",
      "territorial-governance",
      "women-youth-leadership"
    ].map((slug) => fetchJson(contentPath(`themes/${slug}.json`)))
  ).then((themes) => themes.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function getThemeBySlug(slug) {
  try {
    return await fetchJson(contentPath(`themes/${slug}.json`));
  } catch {
    return null;
  }
}

export function getCharts() {
  return Promise.all(CHART_SLUGS.map((slug) => fetchJson(contentPath(`charts/${slug}.json`))));
}

export async function getChartBySlug(slug) {
  try {
    return await fetchJson(contentPath(`charts/${slug}.json`));
  } catch {
    return null;
  }
}

export function getMediaIndex() {
  return fetchJson(contentPath("media/index.json"));
}

export function getFinancialEditorial() {
  return fetchJson(contentPath("financial-editorial.json"));
}

export function getQuotes() {
  return fetchJson(contentPath("quotes.json"));
}

export function getPhotoAssignments() {
  return fetchJson(contentPath("photo-assignments.json"));
}

export function getCountryVideoIndex() {
  return fetchJson(contentPath("country-videos.json"));
}

export function getCreativePitchStory() {
  return fetchJson(contentPath("creative-pitch-story.json"));
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
    return await fetchJson(contentPath("country-signals/index.json"));
  } catch {
    return null;
  }
}

export async function getCountrySignalsByIso(iso3) {
  try {
    return await fetchJson(contentPath(`country-signals/${String(iso3).toUpperCase()}.json`));
  } catch {
    return null;
  }
}

export async function getCountryEvidenceByIso(iso3) {
  try {
    return await fetchJson(contentPath(`country-evidence/${String(iso3).toUpperCase()}.json`));
  } catch {
    return null;
  }
}
