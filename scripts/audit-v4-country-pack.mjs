import fs from "fs/promises";
import path from "path";
import { PLATFORM_STATUS_BY_V4, PLATFORM_THEME_BY_V4 } from "./utils/signal-mappings.mjs";

const ROOT = process.cwd();
const V4_COUNTRIES_DIR = path.join(ROOT, "tenure_facility_country_jsons_v4", "countries");
const LIVE_COUNTRIES_DIR = path.join(ROOT, "content", "countries");
const OUTPUT_PATH = path.join(ROOT, "docs", "v4-country-pack-audit.json");

function sortNumeric(values) {
  return [...values].sort((a, b) => a - b);
}

function sortByCount(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => ({ key, count }));
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function listCountryFiles(dirPath) {
  const files = await fs.readdir(dirPath);
  return files.filter((file) => file.endsWith(".json") && file !== "index.json").sort();
}

function collectLivePages(country) {
  const pages = new Set();

  (country.source_refs ?? []).forEach((ref) => {
    if (Number.isFinite(ref.source_page)) {
      pages.add(Number(ref.source_page));
    }
  });

  (country.stories ?? []).forEach((story) => {
    if (Number.isFinite(story.source_page)) {
      pages.add(Number(story.source_page));
    }
  });

  const metricsSourcePage = country.metrics?.source_page;
  if (Array.isArray(metricsSourcePage)) {
    metricsSourcePage.forEach((page) => {
      if (Number.isFinite(page)) {
        pages.add(Number(page));
      }
    });
  } else if (Number.isFinite(metricsSourcePage)) {
    pages.add(Number(metricsSourcePage));
  }

  (country.projects ?? []).forEach((project) => {
    (project.source_refs ?? []).forEach((ref) => {
      if (Number.isFinite(ref.source_page)) {
        pages.add(Number(ref.source_page));
      }
    });
  });

  if (Number.isFinite(country.quote?.source_page)) {
    pages.add(Number(country.quote.source_page));
  }

  return pages;
}

function collectLiveNumericValues(country) {
  const values = [];

  Object.entries(country.metrics ?? {}).forEach(([key, value]) => {
    if (key === "source_page") {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      values.push(value);
    }
  });

  (country.projects ?? []).forEach((project) => {
    Object.values(project.metrics ?? {}).forEach((value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        values.push(value);
      }
    });
  });

  return values;
}

function hasFootnoteStyleTitle(value) {
  return /^\s*\d+[\.\s]/.test(value);
}

function hasTruncationMarker(value) {
  return value.includes("…");
}

async function main() {
  const [v4Files, liveFiles] = await Promise.all([
    listCountryFiles(V4_COUNTRIES_DIR),
    listCountryFiles(LIVE_COUNTRIES_DIR)
  ]);

  const v4Iso = new Set(v4Files.map((file) => path.basename(file, ".json")));
  const liveIso = new Set(liveFiles.map((file) => path.basename(file, ".json")));

  const onlyInV4 = [...v4Iso].filter((iso) => !liveIso.has(iso)).sort();
  const onlyInLive = [...liveIso].filter((iso) => !v4Iso.has(iso)).sort();

  const topLevelV4 = new Set();
  const topLevelLive = new Set();
  const metricFrequency = new Map();
  const themeFrequency = new Map();
  const directionFrequency = new Map();
  const descriptionTypeFrequency = new Map();
  const mapStatusFrequency = new Map();
  const liveStatusFrequency = new Map();

  const v4PagesGlobal = new Set();
  const livePagesGlobal = new Set();
  const qualityFlags = [];
  const perCountry = [];

  for (const iso of [...v4Iso].sort()) {
    const [v4Country, liveCountry] = await Promise.all([
      readJson(path.join(V4_COUNTRIES_DIR, `${iso}.json`)),
      readJson(path.join(LIVE_COUNTRIES_DIR, `${iso}.json`))
    ]);

    Object.keys(v4Country).forEach((key) => topLevelV4.add(key));
    Object.keys(liveCountry).forEach((key) => topLevelLive.add(key));

    mapStatusFrequency.set(v4Country.map_status, (mapStatusFrequency.get(v4Country.map_status) ?? 0) + 1);
    liveStatusFrequency.set(liveCountry.status, (liveStatusFrequency.get(liveCountry.status) ?? 0) + 1);

    const v4Pages = new Set((v4Country.all_report_pages_mentioned ?? []).filter(Number.isFinite));
    const livePages = collectLivePages(liveCountry);

    v4Pages.forEach((page) => v4PagesGlobal.add(page));
    livePages.forEach((page) => livePagesGlobal.add(page));

    const v4Kpis = v4Country.structured_kpis ?? [];
    const v4Descriptions = v4Country.project_descriptions ?? [];
    const v4Highlights = v4Country.qualitative_highlights ?? [];
    const liveNumericValues = collectLiveNumericValues(liveCountry);

    let unmatchedKpiCount = 0;
    const unmatchedKpisSample = [];

    for (const kpi of v4Kpis) {
      metricFrequency.set(kpi.metric, (metricFrequency.get(kpi.metric) ?? 0) + 1);
      directionFrequency.set(kpi.direction, (directionFrequency.get(kpi.direction) ?? 0) + 1);
      (kpi.theme_tags ?? []).forEach((themeTag) => {
        themeFrequency.set(themeTag, (themeFrequency.get(themeTag) ?? 0) + 1);
      });

      const kpiValue = Number(kpi.value);
      const hasValueMatch = liveNumericValues.some((value) => Math.abs(value - kpiValue) < 1e-9);
      if (!hasValueMatch) {
        unmatchedKpiCount += 1;
        if (unmatchedKpisSample.length < 6) {
          unmatchedKpisSample.push({
            id: kpi.id,
            metric: kpi.metric,
            value: kpi.value,
            source_page: kpi.source_page
          });
        }
      }
    }

    for (const block of v4Descriptions) {
      descriptionTypeFrequency.set(block.description_type, (descriptionTypeFrequency.get(block.description_type) ?? 0) + 1);

      if (typeof block.title === "string") {
        if (hasFootnoteStyleTitle(block.title)) {
          qualityFlags.push({
            iso3: iso,
            issue: "footnote_style_title",
            id: block.id,
            title: block.title
          });
        }
        if (hasTruncationMarker(block.title)) {
          qualityFlags.push({
            iso3: iso,
            issue: "title_contains_truncation_marker",
            id: block.id
          });
        }
      }

      const text = `${block.title ?? ""} ${block.description ?? ""}`;
      if (iso === "PAN" && /papua/i.test(text)) {
        qualityFlags.push({
          iso3: iso,
          issue: "possible_cross_country_reference",
          id: block.id,
          title: block.title
        });
      }
    }

    const v4OnlyPages = [...v4Pages].filter((page) => !livePages.has(page)).sort((a, b) => a - b);
    const narrativeDelta =
      v4Descriptions.length + v4Highlights.length - ((liveCountry.stories ?? []).length + (liveCountry.featured_achievements ?? []).length);

    perCountry.push({
      iso3: iso,
      v4_project_count: v4Country.project_count,
      live_project_count: liveCountry.project_count,
      v4_map_status: v4Country.map_status,
      live_status: liveCountry.status,
      mapped_v4_status: PLATFORM_STATUS_BY_V4[v4Country.map_status] ?? null,
      status_mismatch_after_mapping:
        (PLATFORM_STATUS_BY_V4[v4Country.map_status] ?? null) !== liveCountry.status,
      v4_structured_kpis: v4Kpis.length,
      unmatched_kpis_by_value: unmatchedKpiCount,
      unmatched_kpis_sample: unmatchedKpisSample,
      v4_project_descriptions: v4Descriptions.length,
      v4_qualitative_highlights: v4Highlights.length,
      live_stories: (liveCountry.stories ?? []).length,
      live_featured_achievements: (liveCountry.featured_achievements ?? []).length,
      narrative_delta: narrativeDelta,
      v4_only_pages: v4OnlyPages
    });
  }

  const pagesOnlyInV4 = [...v4PagesGlobal].filter((page) => !livePagesGlobal.has(page));
  const pagesOnlyInLive = [...livePagesGlobal].filter((page) => !v4PagesGlobal.has(page));

  const priorityCountries = [...perCountry]
    .sort((left, right) => {
      const leftScore = left.unmatched_kpis_by_value + Math.max(left.narrative_delta, 0);
      const rightScore = right.unmatched_kpis_by_value + Math.max(right.narrative_delta, 0);
      return rightScore - leftScore;
    })
    .slice(0, 8)
    .map((item) => ({
      iso3: item.iso3,
      merge_priority_score: item.unmatched_kpis_by_value + Math.max(item.narrative_delta, 0),
      unmatched_kpis_by_value: item.unmatched_kpis_by_value,
      narrative_delta: item.narrative_delta
    }));

  const output = {
    generated_at_utc: new Date().toISOString(),
    coverage: {
      v4_country_files: v4Files.length,
      live_country_files: liveFiles.length,
      only_in_v4: onlyInV4,
      only_in_live: onlyInLive
    },
    schema: {
      v4_top_level_keys: [...topLevelV4].sort(),
      live_top_level_keys: [...topLevelLive].sort()
    },
    counts: {
      total_structured_kpis: perCountry.reduce((sum, item) => sum + item.v4_structured_kpis, 0),
      total_project_descriptions: perCountry.reduce((sum, item) => sum + item.v4_project_descriptions, 0),
      total_qualitative_highlights: perCountry.reduce((sum, item) => sum + item.v4_qualitative_highlights, 0),
      total_unmatched_kpis_by_value: perCountry.reduce((sum, item) => sum + item.unmatched_kpis_by_value, 0)
    },
    taxonomies: {
      map_status_frequency: sortByCount(mapStatusFrequency),
      live_status_frequency: sortByCount(liveStatusFrequency),
      status_map_v4_to_live: PLATFORM_STATUS_BY_V4,
      theme_map_v4_to_live: PLATFORM_THEME_BY_V4,
      metric_frequency: sortByCount(metricFrequency),
      theme_frequency: sortByCount(themeFrequency),
      direction_frequency: sortByCount(directionFrequency),
      description_type_frequency: sortByCount(descriptionTypeFrequency)
    },
    page_coverage: {
      unique_pages_v4: sortNumeric(v4PagesGlobal),
      unique_pages_live: sortNumeric(livePagesGlobal),
      pages_only_in_v4: sortNumeric(pagesOnlyInV4),
      pages_only_in_live: sortNumeric(pagesOnlyInLive)
    },
    quality_flags: qualityFlags,
    priority_countries: priorityCountries,
    per_country: perCountry
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log(`Audit written: ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(
    JSON.stringify(
      {
        coverage: output.coverage,
        counts: output.counts,
        pages_only_in_v4: output.page_coverage.pages_only_in_v4,
        top_priority: output.priority_countries
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
