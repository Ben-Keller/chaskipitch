import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");
const CHARTS_DIR = path.join(CONTENT, "charts");
const THEMES_DIR = path.join(CONTENT, "themes");
const GLOBAL_PATH = path.join(CONTENT, "global.json");

const chartSpecs = {
  "impact-growth-2023-2024": {
    figure_id: "Figure 1",
    figure_title: "A Landmark Year. A Lasting Impact",
    source_id: "Figure 1",
    x_key: "metric",
    x_label: "Growth area",
    y_left_label: "Growth",
    y_left_unit: "%",
    series: [
      {
        key: "value",
        label: "Percent growth",
        type: "bar",
        axis: "left",
        color: "#2f7f73",
        unit: "%"
      }
    ],
    raw_columns: [
      { key: "metric", label: "Metric" },
      { key: "value", label: "Growth", unit: "%" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note: "Figure 1 growth percentages transcribed directly from the report graphic.",
      raw_input_refs: ["data-templates/figures/figure_1_table.csv"],
      assumptions: ["Baseline values are not fully itemized in the report figure."]
    }
  },
  "tenure-footprint-regional": {
    figure_id: "Figure 1",
    figure_title: "A Landmark Year. A Lasting Impact",
    source_id: "Figure 1",
    x_key: "label",
    x_label: "Region",
    y_left_label: "Hectares positively impacted",
    y_left_unit: "ha",
    series: [
      {
        key: "value",
        label: "Hectares",
        type: "bar",
        axis: "left",
        color: "#2f7f73",
        unit: "ha"
      }
    ],
    raw_columns: [
      { key: "label", label: "Region" },
      { key: "value", label: "Hectares", unit: "ha" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note: "Regional hectare values transcribed from Figure 1.",
      raw_input_refs: ["data-templates/figures/figure_1_table.csv"],
      assumptions: []
    }
  },
  "regional-hectares-breakout": {
    figure_id: "Figure 1",
    figure_title: "A Landmark Year. A Lasting Impact",
    source_id: "Figure 1",
    x_key: "label",
    x_label: "Region",
    y_left_label: "Hectares positively impacted",
    y_left_unit: "ha",
    series: [
      {
        key: "value",
        label: "Hectares",
        type: "bar",
        axis: "left",
        color: "#3ca696",
        unit: "ha"
      }
    ],
    raw_columns: [
      { key: "label", label: "Region" },
      { key: "value", label: "Hectares", unit: "ha" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note: "Regional breakout transcribed from Figure 1.",
      raw_input_refs: ["data-templates/figures/figure_1_table.csv"],
      assumptions: []
    }
  },
  "territorial-governance-kpis-2024": {
    figure_id: "Figure 1",
    figure_title: "A Landmark Year. A Lasting Impact",
    source_id: "Figure 1",
    x_key: "label",
    x_label: "Indicator",
    y_left_label: "Value",
    y_left_unit: "count",
    series: [
      {
        key: "value",
        label: "Indicator value",
        type: "bar",
        axis: "left",
        color: "#a74d3f",
        unit: "count"
      }
    ],
    raw_columns: [
      { key: "label", label: "Indicator" },
      { key: "value", label: "Value", unit: "count" },
      { key: "unit", label: "Unit" }
    ],
    provenance: {
      extraction_method: "mixed",
      source_note:
        "Core governance indicators are sourced from Figure 1 and normalized into unit-tagged rows for platform rendering.",
      raw_input_refs: ["data-templates/figures/figure_1_table.csv"],
      assumptions: ["Mixed units are normalized via per-row unit tags in this platform."]
    },
    point_units: {
      "Active projects": "projects",
      Countries: "countries",
      "Communities positively impacted": "communities",
      "Communities in secured-tenure areas": "communities"
    }
  },
  "evolution-grants-projects": {
    figure_id: "Figure 2",
    figure_title: "Threads in the Tenure Tapestry",
    source_id: "Figure 2",
    x_key: "year",
    x_label: "Year",
    y_left_label: "Grants / disbursed (USD)",
    y_left_unit: "USD",
    y_right_label: "Projects",
    y_right_unit: "projects",
    series: [
      {
        key: "value",
        label: "Funding (USD)",
        type: "line",
        axis: "left",
        color: "#2f7f73",
        unit: "USD"
      },
      {
        key: "projects",
        label: "Projects",
        type: "line",
        axis: "right",
        color: "#c35745",
        unit: "projects"
      }
    ],
    raw_columns: [
      { key: "year", label: "Year" },
      { key: "label", label: "Funding type" },
      { key: "value", label: "Funding", unit: "USD" },
      { key: "projects", label: "Projects", unit: "projects" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note:
        "Figure 2 timeline values were transcribed and split into a dual-series chart (funding vs projects).",
      raw_input_refs: ["data-templates/figures/figure_2_table.csv"],
      assumptions: ["2024 funding value is treated as disbursement per report narrative label."]
    }
  },
  "womens-leadership-highlights-2024": {
    figure_id: "Figure 4",
    figure_title: "Women and Youth Leadership Indicators",
    source_id: "Figure 4",
    x_key: "label",
    x_label: "Indicator",
    y_left_label: "Value",
    y_left_unit: "count",
    series: [
      {
        key: "value",
        label: "Indicator value",
        type: "bar",
        axis: "left",
        color: "#c35745",
        unit: "count"
      }
    ],
    raw_columns: [
      { key: "label", label: "Indicator" },
      { key: "value", label: "Value", unit: "count" },
      { key: "unit", label: "Unit" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note: "Figure 4 values were transcribed and unit-tagged for mixed-indicator comparability.",
      raw_input_refs: ["data-templates/figures/figure_4_table.csv"],
      assumptions: []
    },
    point_units: {
      "New women leaders (DRC)": "leaders",
      "Increase in women-led villages (Guyana)": "%",
      "Indigenous women leaders in CEDAW report (Ecuador)": "leaders",
      "Women leaders mobilised (Bolivia)": "leaders",
      "Women-led producer groups (India)": "groups",
      "Gender-responsive mapped hectares (Indonesia)": "ha"
    }
  },
  "learning-exchanges-2024": {
    figure_id: "Figure 5",
    figure_title: "Learning and Exchange Signals",
    source_id: "Figure 5",
    x_key: "label",
    x_label: "Indicator",
    y_left_label: "Count",
    y_left_unit: "count",
    series: [
      {
        key: "value",
        label: "Count",
        type: "bar",
        axis: "left",
        color: "#2f7f73",
        unit: "count"
      }
    ],
    raw_columns: [
      { key: "label", label: "Indicator" },
      { key: "value", label: "Value", unit: "count" },
      { key: "unit", label: "Unit" }
    ],
    provenance: {
      extraction_method: "mixed",
      source_note:
        "Learning exchange metrics combine report summary values (page 10) and figure-linked indicators from section pages.",
      raw_input_refs: ["data-templates/figures/figure_5_table.csv"],
      assumptions: ["Women governance exchange participant value is approximate as reported narrative text."]
    },
    point_units: {
      "Total exchanges": "exchanges",
      "Exchange types": "types",
      "Esperantina countries": "countries",
      "Women governance exchange participants": "leaders"
    }
  },
  "funding-flow-2024": {
    figure_id: "Figure 6",
    figure_title: "2024 Funding Flow",
    source_id: "Figure 6",
    x_key: "label",
    x_label: "Funding flow category",
    y_left_label: "USD",
    y_left_unit: "USD",
    series: [
      {
        key: "value",
        label: "USD",
        type: "bar",
        axis: "left",
        color: "#a74d3f",
        unit: "USD"
      }
    ],
    raw_columns: [
      { key: "label", label: "Category" },
      { key: "value", label: "Value", unit: "USD" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note: "Funding flow values transcribed from Figure 6 with categories preserved.",
      raw_input_refs: ["data-templates/figures/figure_6_table.csv"],
      assumptions: []
    }
  },
  "funding-milestones-2024": {
    figure_id: "Figure 7",
    figure_title: "Our 2024 Funding Milestones",
    source_id: "Figure 7",
    x_key: "label",
    x_label: "Funding milestone",
    y_left_label: "USD",
    y_left_unit: "USD",
    series: [
      {
        key: "value",
        label: "USD",
        type: "bar",
        axis: "left",
        color: "#2f7f73",
        unit: "USD"
      }
    ],
    raw_columns: [
      { key: "label", label: "Milestone" },
      { key: "value", label: "Value", unit: "USD" }
    ],
    provenance: {
      extraction_method: "transcribed_from_figure",
      source_note: "Figure 7 funding commitments transcribed directly from the report.",
      raw_input_refs: ["data-templates/figures/figure_7_table.csv"],
      assumptions: ["FCDO AMCAT value is treated as a multi-year commitment as noted by the report."]
    }
  },
  "mapping-and-tech-kpis-2024": {
    figure_id: "Figure 4 / Chapter Synthesis",
    figure_title: "Technology and Mapping Indicators",
    source_id: "Figure 4",
    x_key: "label",
    x_label: "Indicator",
    y_left_label: "Value",
    y_left_unit: "count",
    series: [
      {
        key: "value",
        label: "Indicator value",
        type: "bar",
        axis: "left",
        color: "#2f7f73",
        unit: "count"
      }
    ],
    raw_columns: [
      { key: "label", label: "Indicator" },
      { key: "value", label: "Value", unit: "count" },
      { key: "unit", label: "Unit" }
    ],
    provenance: {
      extraction_method: "mixed",
      source_note:
        "Technology indicators combine direct chapter extraction (pages 39 and 44) and figure-linked values (page 47).",
      raw_input_refs: ["data-templates/figures/figure_4_table.csv"],
      assumptions: ["This chart combines metrics with different units and scales."]
    },
    point_units: {
      "JharFRA claims target": "claims",
      "DRC mapped hectares": "ha",
      "Indonesia gender-responsive mapped hectares": "ha",
      "Official Indigenous-led geospatial platforms": "platforms"
    }
  },
  "policy-and-advocacy-highlights-2024": {
    figure_id: "Policy Chapter Synthesis",
    figure_title: "Policy and Advocacy Highlights",
    source_id: "Policy Synthesis",
    x_key: "label",
    x_label: "Indicator",
    y_left_label: "Value",
    y_left_unit: "count",
    series: [
      {
        key: "value",
        label: "Indicator value",
        type: "bar",
        axis: "left",
        color: "#a74d3f",
        unit: "count"
      }
    ],
    raw_columns: [
      { key: "label", label: "Indicator" },
      { key: "value", label: "Value", unit: "count" },
      { key: "unit", label: "Unit" }
    ],
    provenance: {
      extraction_method: "mixed",
      source_note:
        "Policy chart combines legal and advocacy markers across pages 13, 18, 24, and financing references.",
      raw_input_refs: ["data-templates/figures/figure_7_table.csv"],
      assumptions: ["UK Amazon commitment is expressed in GBP million in this chart for report fidelity."]
    },
    point_units: {
      "Inter-American Court rulings supported": "ruling",
      "COP16 recognition milestones": "milestone",
      "UK Amazon commitment (GBP million)": "GBP_million",
      "Learning exchanges with policy relevance": "exchanges"
    }
  }
};

const inputRefByPage = {
  9: "data-templates/figures/figure_1_table.csv",
  10: "data-templates/figures/figure_5_table.csv",
  15: "data-templates/editorial/phase2_page_matrix_30_83.json",
  18: "data-templates/editorial/phase2_page_matrix_30_83.json",
  22: "data-templates/editorial/phase2_page_matrix_30_83.json",
  23: "data-templates/editorial/phase2_page_matrix_30_83.json",
  24: "data-templates/figures/figure_2_table.csv",
  39: "data-templates/editorial/phase2_country_signals.json",
  44: "data-templates/editorial/phase2_country_signals.json",
  47: "data-templates/figures/figure_4_table.csv",
  53: "data-templates/figures/figure_5_table.csv",
  54: "data-templates/figures/figure_5_table.csv",
  62: "data-templates/figures/figure_6_table.csv",
  76: "data-templates/figures/figure_7_table.csv"
};

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

function normalizeMethod(scope, page) {
  if (scope === "regional" || page === 9 || page === 24 || page === 62 || page === 76) {
    return "direct_report_figure";
  }
  if (page >= 30) {
    return "chapter_indicator_extraction";
  }
  return "report_summary_transcription";
}

async function enrichCharts() {
  const files = (await fs.readdir(CHARTS_DIR)).filter((file) => file.endsWith(".json"));

  for (const file of files) {
    const chartPath = path.join(CHARTS_DIR, file);
    const chart = await readJson(chartPath);
    const spec = chartSpecs[chart.slug];

    if (!spec) {
      continue;
    }

    chart.chart_config = {
      figure_id: spec.figure_id,
      figure_title: spec.figure_title,
      x_key: spec.x_key,
      x_label: spec.x_label,
      y_left_label: spec.y_left_label,
      y_left_unit: spec.y_left_unit,
      y_right_label: spec.y_right_label,
      y_right_unit: spec.y_right_unit,
      series: spec.series
    };

    chart.raw_table = {
      columns: spec.raw_columns
    };

    chart.provenance = spec.provenance;

    if (Array.isArray(chart.source_refs) && chart.source_refs.length) {
      chart.source_refs = chart.source_refs.map((ref, index) =>
        index === 0 ? { ...ref, source_id: spec.source_id } : ref
      );
    }

    if (spec.point_units) {
      chart.data_points = chart.data_points.map((point) => {
        const unit = spec.point_units[point.label];
        if (!unit) {
          return point;
        }
        return { ...point, unit };
      });
    }

    await writeJson(chartPath, chart);
  }
}

async function buildKpiRegistry() {
  const global = await readJson(GLOBAL_PATH);
  const themeFiles = (await fs.readdir(THEMES_DIR)).filter((file) => file.endsWith(".json"));
  const themes = await Promise.all(themeFiles.map((file) => readJson(path.join(THEMES_DIR, file))));

  const registry = new Map();

  const addRegistryEntry = (entry) => {
    if (!registry.has(entry.kpi_id)) {
      registry.set(entry.kpi_id, entry);
    }
  };

  (global.hero_kpis ?? []).forEach((kpi) => {
    addRegistryEntry({
      kpi_id: kpi.id,
      label: kpi.label,
      scope: "global",
      method: normalizeMethod("global", kpi.source_page),
      formula: `value = direct transcription of ${kpi.id} from report source`,
      input_refs: [inputRefByPage[kpi.source_page] ?? "manual_report_extraction"],
      source_pages: [kpi.source_page],
      source_figure: kpi.source_page === 9 ? "Figure 1" : undefined,
      unit: kpi.unit,
      note: "Global headline KPI."
    });
  });

  Object.entries(global.regional_kpis ?? {}).forEach(([region, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      if (typeof value !== "number") {
        return;
      }
      const kpiId = `${key}_${region}`;
      addRegistryEntry({
        kpi_id: kpiId,
        label: `${key.replaceAll("_", " ")} (${region.replaceAll("_", " ")})`,
        scope: "regional",
        region,
        method: normalizeMethod("regional", values.source_page),
        formula: `value = regional breakout for ${key} in ${region}`,
        input_refs: [inputRefByPage[values.source_page] ?? "manual_report_extraction"],
        source_pages: [values.source_page],
        source_figure: values.source_page === 9 ? "Figure 1" : undefined,
        unit: key.includes("hectares") ? "ha" : "count",
        note: "Regional KPI breakout."
      });
    });
  });

  themes.forEach((theme) => {
    (theme.kpis ?? []).forEach((kpi) => {
      addRegistryEntry({
        kpi_id: kpi.id,
        label: kpi.label,
        scope: "theme",
        theme: theme.slug,
        method: normalizeMethod("theme", kpi.source_page),
        formula: `value = thematic extraction for ${theme.slug} (${kpi.id})`,
        input_refs: [inputRefByPage[kpi.source_page] ?? "manual_report_extraction"],
        source_pages: [kpi.source_page],
        source_figure: kpi.source_page === 9 ? "Figure 1" : undefined,
        unit: kpi.unit,
        note: `Theme-native KPI used in ${theme.slug}.`
      });
    });
  });

  const themeModes = Object.fromEntries(themes.map((theme) => [theme.slug, "theme_native"]));
  themeModes["tenure-security"] = "hero_global_with_region_overrides";

  global.kpi_display_logic = {
    default_theme_mode: "theme_native",
    theme_modes: themeModes,
    regional_override_kpi_ids: ["hectares_positively_impacted"],
    regional_recomputed_kpi_ids: ["active_projects", "countries"],
    regional_recompute_scope: "visible_country_selection",
    note:
      "Tenure Security uses global hero KPIs with region-specific overrides. Other themes use theme-native KPI sets."
  };

  global.kpi_derivation_registry = Array.from(registry.values()).sort((left, right) =>
    left.kpi_id.localeCompare(right.kpi_id)
  );

  global.data_model_version = "phase5.0";
  global.report.last_updated = "2026-03-22";

  await writeJson(GLOBAL_PATH, global);
}

async function main() {
  await enrichCharts();
  await buildKpiRegistry();
  console.log("Phase 5 enrichment applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
