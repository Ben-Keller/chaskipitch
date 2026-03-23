import { useEffect, useState } from "react";
import { withBasePath } from "../lib/paths";

export const regionOptions = [
  { key: "global", label: "Global" },
  { key: "africa", label: "Africa" },
  { key: "asia", label: "Asia" },
  { key: "latin_america", label: "Latin America" }
];

export const themeOrder = [
  "tenure-security",
  "climate-biodiversity",
  "women-youth-leadership",
  "learning-exchange",
  "community-led-finance",
  "technology-mapping",
  "policy-advocacy",
  "territorial-governance"
];

export const fallbackKpiDisplayLogic = {
  default_theme_mode: "theme_native",
  theme_modes: {
    "tenure-security": "hero_global_with_region_overrides"
  },
  regional_override_kpi_ids: ["hectares_positively_impacted"],
  regional_recomputed_kpi_ids: ["active_projects", "countries"],
  regional_recompute_scope: "visible_country_selection"
};

const fallbackRegionalKpis = {
  global: { note: "" },
  africa: { note: "" },
  asia: { note: "" },
  latin_america: { note: "" }
};

export const fallbackGlobalContent = {
  hero_kpis: [],
  regional_kpis: fallbackRegionalKpis,
  kpi_display_logic: fallbackKpiDisplayLogic,
  kpi_derivation_registry: [],
  status_definitions: [],
  timeline: [],
  about: {
    mission: "",
    vision: "",
    pillars: []
  }
};

export const fallbackTheme = {
  slug: "tenure-security",
  name: "All Thematics",
  description: "",
  kpis: [],
  source_pages: [9],
  related_stories: []
};

export const fallbackWorldGeo = {
  type: "FeatureCollection",
  features: []
};

export const fallbackGeoCollection = {
  type: "FeatureCollection",
  features: []
};

export const fallbackCountryVideoIndex = {
  by_iso3: {},
  global_recent: []
};

export const fallbackCountryEvidence = {
  iso3: "",
  structured_kpis: [],
  project_descriptions: [],
  qualitative_highlights: [],
  organization_mentions: []
};

export const fallbackPhotoAssignments = {
  country_photos: {},
  theme_media: {}
};

function toTitle(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateText(value, maxChars = 180) {
  const text = String(value ?? "").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

function inferMetricUnit(key) {
  const lower = key.toLowerCase();
  if (lower.includes("hectares") || lower.endsWith("_ha") || lower.includes("_ha_")) {
    return "ha";
  }
  if (lower.includes("usd") || lower.includes("disbursement") || lower.includes("budget")) {
    return "USD";
  }
  return "count";
}

export function buildCountryKpis(country) {
  if (!country) {
    return [];
  }

  const entries = Object.entries(country.metrics ?? {})
    .filter(([key, value]) => key !== "source_page" && typeof value === "number")
    .sort(([aKey], [bKey]) => {
      if (aKey === "project_count") return -1;
      if (bKey === "project_count") return 1;
      return aKey.localeCompare(bKey);
    })
    .slice(0, 6);

  return entries.map(([key, value]) => ({
    id: `${country.iso3}-${key}`,
    label: toTitle(key),
    value,
    unit: inferMetricUnit(key)
  }));
}

function toEmbedUrl(rawUrl, videoId) {
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}`;
  }

  const url = String(rawUrl ?? "").trim();
  if (!url) {
    return "";
  }

  if (url.includes("/embed/")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    const id = parsed.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : "";
  } catch {
    return "";
  }
}

function toWatchUrl(rawUrl, videoId) {
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  const url = String(rawUrl ?? "").trim();
  if (!url) {
    return "";
  }

  if (url.includes("/watch?v=") || url.includes("youtu.be/")) {
    return url;
  }

  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (embedMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${embedMatch[1]}`;
  }

  return url;
}

export function buildCountryVideos(country, countryVideoIndex) {
  if (!country) {
    return [];
  }

  const countryMatchedVideos = countryVideoIndex?.by_iso3?.[country.iso3] ?? [];
  const indexedSource = countryMatchedVideos.length
    ? countryMatchedVideos
    : countryVideoIndex?.global_recent ?? [];

  const indexedVideos = indexedSource.map((video) => ({
    title: video.title,
    embedUrl: toEmbedUrl(video.embed_url ?? video.url, video.video_id),
    watchUrl: toWatchUrl(video.url ?? video.embed_url, video.video_id),
    thumbnail: video.thumbnail ?? "",
    publishedAt: video.published_at ?? null,
    isFallback: countryMatchedVideos.length === 0
  }));

  const countryFileVideos = (country.media?.videos ?? []).map((video) => ({
    title: video.title,
    embedUrl: toEmbedUrl(video.url),
    watchUrl: toWatchUrl(video.url),
    thumbnail: "",
    publishedAt: null,
    isFallback: false
  }));

  const merged = [...indexedVideos, ...countryFileVideos]
    .filter((video) => video.embedUrl || video.watchUrl)
    .filter((video) => typeof video.title === "string" && video.title.length > 0);

  const deduped = new Map();
  merged.forEach((video) => {
    const key = video.watchUrl || video.embedUrl || video.title;
    if (!deduped.has(key)) {
      deduped.set(key, video);
    }
  });

  return [...deduped.values()].slice(0, 6);
}

function normalizeEvidenceUnit(unit) {
  const raw = String(unit ?? "").toLowerCase();
  if (raw === "hectares" || raw === "ha") {
    return "ha";
  }
  if (raw === "percent" || raw === "percentage" || raw === "%") {
    return "%";
  }
  if (raw === "usd" || raw === "us$") {
    return "USD";
  }
  if (!raw) {
    return "count";
  }
  return unit;
}

export function buildEvidenceKpis(evidence) {
  const rows = Array.isArray(evidence?.structured_kpis) ? evidence.structured_kpis : [];
  return rows
    .filter((entry) => Number.isFinite(entry?.value))
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      label: entry.label ? toTitle(entry.label) : toTitle(entry.metric ?? "Metric"),
      value: entry.value,
      unit: normalizeEvidenceUnit(entry.unit)
    }));
}

export function buildEvidenceExcerpts(evidence) {
  const rows = Array.isArray(evidence?.project_descriptions) ? evidence.project_descriptions : [];
  return rows
    .filter((entry) => entry?.description)
    .slice(0, 3)
    .map((entry) => ({
      id: entry.id ?? entry.title,
      title: truncateText(entry.title ?? "Report excerpt", 80),
      description: truncateText(entry.description, 220)
    }));
}

export function buildEvidenceHighlights(evidence) {
  const rows = Array.isArray(evidence?.qualitative_highlights) ? evidence.qualitative_highlights : [];
  return rows
    .filter((entry) => entry?.highlight)
    .slice(0, 3)
    .map((entry) => ({
      id: entry.id ?? entry.highlight,
      text: truncateText(entry.highlight, 210)
    }));
}

export function AtlasContextPhoto({ src, alt, fallbackSrc = "" }) {
  const [resolvedSrc, setResolvedSrc] = useState(src || fallbackSrc || "");

  useEffect(() => {
    setResolvedSrc(src || fallbackSrc || "");
  }, [src, fallbackSrc]);

  if (!resolvedSrc) {
    return null;
  }

  return (
    <figure className="atlas-context-photo">
      <div className="atlas-context-photo__frame">
        <img
          className="atlas-context-photo__fg"
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (fallbackSrc && resolvedSrc !== fallbackSrc) {
              setResolvedSrc(fallbackSrc);
              return;
            }
            setResolvedSrc("");
          }}
        />
      </div>
    </figure>
  );
}

export function resolveMediaPath(pathValue) {
  return typeof pathValue === "string" ? withBasePath(pathValue) : "";
}
