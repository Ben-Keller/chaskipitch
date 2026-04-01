import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SIGNALS_DIR = path.join(ROOT, "data", "content", "signals");

const ALLOWED_THEME_TAGS = new Set([
  "tenure-security",
  "climate-biodiversity",
  "technology-mapping",
  "policy-advocacy",
  "women-youth-leadership",
  "community-led-finance",
  "territorial-governance"
]);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

function unique(items) {
  return [...new Set(items)];
}

async function main() {
  const errors = [];
  const warnings = [];

  let files;
  try {
    files = (await fs.readdir(SIGNALS_DIR)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    throw new Error("Country signals folder missing. Run `npm run build:signals` first.");
  }
  const countryFiles = files.filter((file) => file !== "index.json");

  const indexPath = path.join(SIGNALS_DIR, "index.json");
  const index = await readJson(indexPath);

  if (!Array.isArray(index.countries)) {
    errors.push("signals/index.json missing countries[]");
  } else if (index.countries.length !== countryFiles.length) {
    errors.push(
      `signals/index.json countries count (${index.countries.length}) does not match files (${countryFiles.length})`
    );
  }

  let totalKpis = 0;
  let totalNarratives = 0;
  let totalQualityFlags = 0;

  for (const file of countryFiles) {
    const payload = await readJson(path.join(SIGNALS_DIR, file));
    const iso3 = file.replace(".json", "");

    if (payload.iso3 !== iso3) {
      errors.push(`signals/${file} has iso3 '${payload.iso3}'`);
    }

    if (!Array.isArray(payload.kpis)) {
      errors.push(`signals/${file} missing kpis[]`);
      continue;
    }

    if (!Array.isArray(payload.narratives)) {
      errors.push(`signals/${file} missing narratives[]`);
      continue;
    }

    const kpiIds = payload.kpis.map((kpi) => kpi.id);
    const duplicateKpiIds = kpiIds.filter((id, index) => kpiIds.indexOf(id) !== index);
    if (duplicateKpiIds.length) {
      errors.push(`signals/${file} duplicate KPI ids: ${unique(duplicateKpiIds).join(", ")}`);
    }

    const narrativeIds = payload.narratives.map((entry) => entry.id);
    const duplicateNarrativeIds = narrativeIds.filter((id, index) => narrativeIds.indexOf(id) !== index);
    if (duplicateNarrativeIds.length) {
      errors.push(`signals/${file} duplicate narrative ids: ${unique(duplicateNarrativeIds).join(", ")}`);
    }

    const sourcePages = new Set(payload.source_pages ?? []);
    payload.kpis.forEach((kpi) => {
      if (!sourcePages.has(kpi.source_page)) {
        warnings.push(`signals/${file} KPI ${kpi.id} source_page ${kpi.source_page} missing from source_pages[]`);
      }

      for (const tag of kpi.theme_tags ?? []) {
        if (!ALLOWED_THEME_TAGS.has(tag)) {
          warnings.push(`signals/${file} KPI ${kpi.id} has unknown theme tag '${tag}'`);
        }
      }
    });

    payload.narratives.forEach((entry) => {
      if (!entry.body || !entry.body.trim()) {
        errors.push(`signals/${file} narrative ${entry.id} has empty body`);
      }
      if (!sourcePages.has(entry.source_page)) {
        warnings.push(
          `signals/${file} narrative ${entry.id} source_page ${entry.source_page} missing from source_pages[]`
        );
      }
      for (const tag of entry.theme_tags ?? []) {
        if (!ALLOWED_THEME_TAGS.has(tag)) {
          warnings.push(`signals/${file} narrative ${entry.id} has unknown theme tag '${tag}'`);
        }
      }
    });

    totalKpis += payload.kpis.length;
    totalNarratives += payload.narratives.length;
    totalQualityFlags += (payload.quality_flags ?? []).length;

    if (payload.status_mismatch) {
      warnings.push(`signals/${file} status mismatch: mapped=${payload.mapped_status} live=${payload.live_status}`);
    }
  }

  if (index.summary) {
    if (index.summary.total_kpis !== totalKpis) {
      errors.push(`index summary total_kpis (${index.summary.total_kpis}) does not match computed total (${totalKpis})`);
    }
    if (index.summary.total_narratives !== totalNarratives) {
      errors.push(
        `index summary total_narratives (${index.summary.total_narratives}) does not match computed total (${totalNarratives})`
      );
    }
    if (index.summary.total_quality_flags !== totalQualityFlags) {
      errors.push(
        `index summary total_quality_flags (${index.summary.total_quality_flags}) does not match computed total (${totalQualityFlags})`
      );
    }
  }

  console.log("Country signals validation summary");
  console.log(`- Countries checked: ${countryFiles.length}`);
  console.log(`- KPI rows: ${totalKpis}`);
  console.log(`- Narrative rows: ${totalNarratives}`);
  console.log(`- Warnings: ${warnings.length}`);
  warnings.slice(0, 60).forEach((warning) => console.log(`  WARN: ${warning}`));
  if (warnings.length > 60) {
    console.log(`  ... ${warnings.length - 60} additional warnings`);
  }

  if (errors.length) {
    console.log(`- Errors: ${errors.length}`);
    errors.forEach((error) => console.log(`  ERROR: ${error}`));
    throw new Error("Country signals validation failed.");
  }

  console.log("Country signals validation passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
