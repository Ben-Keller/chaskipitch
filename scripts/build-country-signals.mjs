import fs from "fs/promises";
import path from "path";
import {
  PLATFORM_REGION_BY_V4,
  PLATFORM_STATUS_BY_V4,
  PLATFORM_THEME_BY_V4,
  SIGNAL_DIRECTIONS
} from "./signal-mappings.mjs";

const ROOT = process.cwd();
const V4_DIR = path.join(ROOT, "data", "source", "countries-v4");
const LIVE_COUNTRIES_DIR = path.join(ROOT, "data", "content", "countries");
const OUTPUT_DIR = path.join(ROOT, "data", "content", "signals");

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function cleanNarrativeTitle(title) {
  const raw = cleanText(title);
  const flags = [];
  let cleaned = raw;

  if (cleaned.includes("…")) {
    flags.push("title_contains_truncation_marker");
  }

  if (/^\d+\s+[A-Z][a-z]/.test(cleaned)) {
    flags.push("footnote_style_title");
    cleaned = cleaned.replace(/^\d+\s+/, "");
  }

  if (/^\d+\.[A-Za-z]/.test(cleaned)) {
    flags.push("footnote_style_title");
  }

  return { raw, cleaned, flags };
}

function normalizeProjectRef(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const slug = cleanText(value.slug);
  const displayName = cleanText(value.display_name);
  if (!slug || !displayName) {
    return null;
  }

  return {
    slug,
    display_name: displayName
  };
}

function normalizeThemeTags(themeTags, qualityFlags, context) {
  const mapped = new Set();

  for (const rawTag of Array.isArray(themeTags) ? themeTags : []) {
    const normalizedRawTag = cleanText(rawTag);
    if (!normalizedRawTag) {
      continue;
    }
    const mappedTag = PLATFORM_THEME_BY_V4[normalizedRawTag];
    if (mappedTag) {
      mapped.add(mappedTag);
      continue;
    }

    qualityFlags.push({
      type: "unknown_theme_tag",
      message: `Unknown theme tag '${normalizedRawTag}' in ${context}.`,
      source_page: undefined
    });
  }

  return [...mapped];
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)).map(Number))].sort((a, b) => a - b);
}

function dedupeBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return [...map.values()];
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function buildCountrySignals(iso3) {
  const sourceFile = `${iso3}.json`;
  const [v4Country, liveCountry] = await Promise.all([
    readJson(path.join(V4_DIR, sourceFile)),
    readJson(path.join(LIVE_COUNTRIES_DIR, sourceFile)).catch(() => null)
  ]);

  const qualityFlags = [];

  const region = PLATFORM_REGION_BY_V4[v4Country.region];
  if (!region) {
    throw new Error(`Unsupported region '${v4Country.region}' in ${sourceFile}`);
  }

  const mappedStatus = PLATFORM_STATUS_BY_V4[v4Country.map_status];
  if (!mappedStatus) {
    throw new Error(`Unsupported map_status '${v4Country.map_status}' in ${sourceFile}`);
  }

  const liveStatus = liveCountry?.status ?? null;
  const statusMismatch = Boolean(liveStatus && mappedStatus !== liveStatus);

  if (statusMismatch) {
    qualityFlags.push({
      type: "status_mismatch_against_live",
      message: `Mapped status '${mappedStatus}' differs from live status '${liveStatus}'.`
    });
  }

  const canonicalProjects = dedupeBy(
    (Array.isArray(v4Country.canonical_projects) ? v4Country.canonical_projects : [])
      .map((entry) => normalizeProjectRef(entry))
      .filter(Boolean),
    (entry) => entry.slug
  );

  const normalizedKpis = [];
  for (const kpi of Array.isArray(v4Country.structured_kpis) ? v4Country.structured_kpis : []) {
    const value = Number(kpi.value);
    if (!Number.isFinite(value)) {
      qualityFlags.push({
        type: "invalid_kpi_value",
        message: `KPI '${kpi.id}' has non-numeric value '${kpi.value}'.`,
        entity_id: kpi.id
      });
      continue;
    }

    const direction = cleanText(kpi.direction);
    const safeDirection = SIGNAL_DIRECTIONS.has(direction) ? direction : "report";
    if (!SIGNAL_DIRECTIONS.has(direction)) {
      qualityFlags.push({
        type: "unknown_direction",
        message: `Unknown direction '${direction}' for KPI '${kpi.id}'. Defaulted to 'report'.`,
        entity_id: kpi.id,
        source_page: Number.isFinite(kpi.source_page) ? Number(kpi.source_page) : undefined
      });
    }

    const projectRef = normalizeProjectRef(kpi.project_or_initiative);
    const themeTags = normalizeThemeTags(kpi.theme_tags, qualityFlags, `KPI ${kpi.id}`);

    normalizedKpis.push({
      id: cleanText(kpi.id),
      metric: cleanText(kpi.metric),
      label: cleanText(kpi.label),
      value,
      unit: cleanText(kpi.unit),
      metric_family: cleanText(kpi.metric_family),
      direction: safeDirection,
      beneficiary_group: kpi.beneficiary_group ? cleanText(kpi.beneficiary_group) : null,
      kpi_category: cleanText(kpi.kpi_category),
      time_period: cleanText(kpi.time_period),
      project_or_initiative: projectRef,
      theme_tags: themeTags,
      geography_scope: cleanText(kpi.geography_scope),
      source_page: Number(kpi.source_page),
      source_heading: kpi.source_heading ? cleanText(kpi.source_heading) : null,
      source_text: cleanText(kpi.source_text)
    });
  }

  const kpis = dedupeBy(
    normalizedKpis,
    (kpi) =>
      `${kpi.metric}|${kpi.value}|${kpi.unit}|${kpi.source_page}|${kpi.project_or_initiative?.slug ?? "none"}`
  );

  if (kpis.length < normalizedKpis.length) {
    qualityFlags.push({
      type: "deduplicated_kpis",
      message: `Removed ${normalizedKpis.length - kpis.length} duplicate KPI rows.`
    });
  }

  const narrativeRecords = [];

  for (const block of Array.isArray(v4Country.project_descriptions) ? v4Country.project_descriptions : []) {
    const title = cleanNarrativeTitle(block.title);
    const sourcePage = Number(block.source_page);
    title.flags.forEach((flagType) => {
      qualityFlags.push({
        type: flagType,
        message: `Narrative '${block.id}' title required cleanup.`,
        entity_id: cleanText(block.id),
        source_page: Number.isFinite(sourcePage) ? sourcePage : undefined
      });
    });

    const body = cleanText(block.description);
    const combinedText = `${title.raw} ${body}`;
    if (iso3 === "PAN" && /papua/i.test(combinedText)) {
      qualityFlags.push({
        type: "possible_cross_country_reference",
        message: "Detected Papua reference in Panama narrative block.",
        entity_id: cleanText(block.id),
        source_page: Number.isFinite(sourcePage) ? sourcePage : undefined
      });
    }

    narrativeRecords.push({
      id: cleanText(block.id),
      kind: "project_description",
      title: title.cleaned || title.raw || "Untitled narrative",
      body,
      narrative_type: cleanText(block.description_type) || "project_overview",
      project_or_initiative: normalizeProjectRef(block.project_or_initiative),
      theme_tags: normalizeThemeTags(block.theme_tags, qualityFlags, `Narrative ${block.id}`),
      organizations_mentioned: dedupeBy(
        (Array.isArray(block.organizations_mentioned) ? block.organizations_mentioned : [])
          .map((entry) => cleanText(entry))
          .filter(Boolean),
        (entry) => entry
      ),
      related_kpi_ids: dedupeBy(
        (Array.isArray(block.related_kpi_ids) ? block.related_kpi_ids : [])
          .map((entry) => cleanText(entry))
          .filter(Boolean),
        (entry) => entry
      ),
      related_metric_families: [],
      signal_type: null,
      highlight_category: null,
      source_page: Number.isFinite(sourcePage) ? sourcePage : 1
    });
  }

  for (const highlight of Array.isArray(v4Country.qualitative_highlights) ? v4Country.qualitative_highlights : []) {
    const title = cleanNarrativeTitle(highlight.title);
    const sourcePage = Number(highlight.source_page);
    title.flags.forEach((flagType) => {
      qualityFlags.push({
        type: flagType,
        message: `Highlight '${highlight.id}' title required cleanup.`,
        entity_id: cleanText(highlight.id),
        source_page: Number.isFinite(sourcePage) ? sourcePage : undefined
      });
    });

    narrativeRecords.push({
      id: cleanText(highlight.id),
      kind: "qualitative_highlight",
      title: title.cleaned || title.raw || "Untitled highlight",
      body: cleanText(highlight.description),
      narrative_type: cleanText(highlight.highlight_category) || cleanText(highlight.signal_type) || "highlight",
      project_or_initiative: normalizeProjectRef(highlight.project_or_initiative),
      theme_tags: normalizeThemeTags(highlight.theme_tags, qualityFlags, `Highlight ${highlight.id}`),
      organizations_mentioned: dedupeBy(
        (Array.isArray(highlight.organizations_mentioned) ? highlight.organizations_mentioned : [])
          .map((entry) => cleanText(entry))
          .filter(Boolean),
        (entry) => entry
      ),
      related_kpi_ids: [],
      related_metric_families: dedupeBy(
        (Array.isArray(highlight.related_metric_families) ? highlight.related_metric_families : [])
          .map((entry) => cleanText(entry))
          .filter(Boolean),
        (entry) => entry
      ),
      signal_type: cleanText(highlight.signal_type) || null,
      highlight_category: cleanText(highlight.highlight_category) || null,
      source_page: Number.isFinite(sourcePage) ? sourcePage : 1
    });
  }

  const narratives = dedupeBy(
    narrativeRecords,
    (entry) => `${entry.kind}|${entry.source_page}|${entry.title.toLowerCase()}`
  );

  if (narratives.length < narrativeRecords.length) {
    qualityFlags.push({
      type: "deduplicated_narratives",
      message: `Removed ${narrativeRecords.length - narratives.length} duplicate narrative rows.`
    });
  }

  const organizations = dedupeBy(
    [
      ...(Array.isArray(v4Country.organization_mentions) ? v4Country.organization_mentions : []),
      ...narratives.flatMap((entry) => entry.organizations_mentioned)
    ]
      .map((entry) => cleanText(entry))
      .filter(Boolean),
    (entry) => entry
  );

  const sourcePages = uniqueSortedNumbers([
    ...(Array.isArray(v4Country.all_report_pages_mentioned) ? v4Country.all_report_pages_mentioned : []),
    ...kpis.map((kpi) => kpi.source_page),
    ...narratives.map((entry) => entry.source_page)
  ]);

  const notes = dedupeBy(
    (Array.isArray(v4Country.notes) ? v4Country.notes : []).map((note) => cleanText(note)).filter(Boolean),
    (entry) => entry
  );

  const output = {
    iso3,
    country_name: cleanText(v4Country.country_name),
    region,
    map_status: v4Country.map_status,
    mapped_status: mappedStatus,
    live_status: liveStatus,
    status_mismatch: statusMismatch,
    project_count: Number(v4Country.project_count) || 0,
    source_report: cleanText(v4Country.source_report),
    source_pages: sourcePages,
    canonical_projects: canonicalProjects,
    organizations,
    kpis,
    narratives,
    quality_flags: qualityFlags,
    notes,
    coverage: {
      structured_kpi_count: kpis.length,
      narrative_count: narratives.length,
      project_description_count: (Array.isArray(v4Country.project_descriptions) ? v4Country.project_descriptions : []).length,
      qualitative_highlight_count: (Array.isArray(v4Country.qualitative_highlights) ? v4Country.qualitative_highlights : []).length
    },
    generated_from: {
      schema_version: cleanText(v4Country.schema_version || "v4"),
      source_file: sourceFile
    }
  };

  return output;
}

async function main() {
  const files = (await fs.readdir(V4_DIR)).filter((file) => file.endsWith(".json") && file !== "index.json").sort();

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const existingOutputFiles = (await fs.readdir(OUTPUT_DIR)).filter((file) => file.endsWith(".json"));
  await Promise.all(existingOutputFiles.map((file) => fs.rm(path.join(OUTPUT_DIR, file), { force: true })));

  const countries = [];
  for (const file of files) {
    const iso3 = file.replace(".json", "");
    const countrySignals = await buildCountrySignals(iso3);
    countries.push(countrySignals);
    await fs.writeFile(path.join(OUTPUT_DIR, file), `${JSON.stringify(countrySignals, null, 2)}\n`, "utf-8");
  }

  const sortedCountries = [...countries].sort((left, right) => left.country_name.localeCompare(right.country_name));
  const indexPayload = {
    source_folder: "data/source/countries-v4",
    countries: sortedCountries.map((country) => ({
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      map_status: country.map_status,
      mapped_status: country.mapped_status,
      live_status: country.live_status,
      status_mismatch: country.status_mismatch,
      project_count: country.project_count,
      kpi_count: country.coverage.structured_kpi_count,
      narrative_count: country.coverage.narrative_count,
      quality_flag_count: country.quality_flags.length,
      source_pages: country.source_pages
    })),
    summary: {
      country_count: sortedCountries.length,
      total_kpis: sortedCountries.reduce((sum, country) => sum + country.coverage.structured_kpi_count, 0),
      total_narratives: sortedCountries.reduce((sum, country) => sum + country.coverage.narrative_count, 0),
      total_quality_flags: sortedCountries.reduce((sum, country) => sum + country.quality_flags.length, 0),
      status_mismatch_countries: sortedCountries.filter((country) => country.status_mismatch).map((country) => country.iso3)
    }
  };

  await fs.writeFile(path.join(OUTPUT_DIR, "index.json"), `${JSON.stringify(indexPayload, null, 2)}\n`, "utf-8");

  console.log("Country signals build summary");
  console.log(`- Countries processed: ${indexPayload.summary.country_count}`);
  console.log(`- KPI rows: ${indexPayload.summary.total_kpis}`);
  console.log(`- Narrative rows: ${indexPayload.summary.total_narratives}`);
  console.log(`- Quality flags: ${indexPayload.summary.total_quality_flags}`);
  if (indexPayload.summary.status_mismatch_countries.length) {
    console.log(`- Status mismatches vs live: ${indexPayload.summary.status_mismatch_countries.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
