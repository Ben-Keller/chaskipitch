import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "data", "content");

async function readJson(...segments) {
  const filePath = path.join(CONTENT_DIR, ...segments);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function listJsonFiles(dir) {
  const absolute = path.join(CONTENT_DIR, dir);
  let files = [];
  try {
    files = await fs.readdir(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return files.filter((file) => file.endsWith(".json"));
}

async function main() {
  const errors = [];
  const warnings = [];

  const [global, mediaIndex, chartFiles, countryFiles] = await Promise.all([
    readJson("global.json"),
    readJson("media", "index.json"),
    listJsonFiles("charts"),
    listJsonFiles("countries")
  ]);

  if (!global.kpi_display_logic) {
    errors.push("global.json missing kpi_display_logic");
  }

  if (!Array.isArray(global.kpi_derivation_registry) || !global.kpi_derivation_registry.length) {
    errors.push("global.json missing kpi_derivation_registry entries");
  }

  const mediaPhotoSet = new Set((mediaIndex.photos ?? []).map((photo) => photo.file));
  for (const photo of mediaIndex.photos ?? []) {
    if (!photo.alt || !photo.alt.trim()) {
      errors.push(`media/index.json photo ${photo.id} missing alt text`);
    }
    if (!photo.caption || !photo.caption.trim()) {
      warnings.push(`media/index.json photo ${photo.id} missing caption`);
    }
  }

  for (const file of countryFiles) {
    const country = await readJson("countries", file);
    for (const photoFile of country.media?.photos ?? []) {
      if (!mediaPhotoSet.has(photoFile)) {
        warnings.push(`countries/${file} references photo not present in media index: ${photoFile}`);
      }
    }
  }

  for (const file of chartFiles) {
    const chart = await readJson("charts", file);
    const fileHint = `charts/${file}`;

    if (!chart.chart_config) {
      errors.push(`${fileHint} missing chart_config`);
    }
    if (!chart.raw_table) {
      errors.push(`${fileHint} missing raw_table`);
    }
    if (!chart.provenance) {
      errors.push(`${fileHint} missing provenance`);
    }
    if (!Array.isArray(chart.source_refs) || !chart.source_refs.length) {
      errors.push(`${fileHint} missing source_refs`);
    }

    if (chart.units === "mixed") {
      chart.data_points?.forEach((point, index) => {
        if (typeof point.unit !== "string" || !point.unit.trim()) {
          warnings.push(`${fileHint} mixed-unit point ${index} missing explicit unit`);
        }
      });
    }
  }

  console.log("Phase 6 QA validation summary");
  console.log(`- Charts checked: ${chartFiles.length}`);
  console.log(`- Countries checked: ${countryFiles.length}`);
  console.log(`- Warnings: ${warnings.length}`);
  warnings.slice(0, 60).forEach((warning) => console.log(`  WARN: ${warning}`));

  if (warnings.length > 60) {
    console.log(`  ... ${warnings.length - 60} more warnings`);
  }

  if (errors.length) {
    console.log(`- Errors: ${errors.length}`);
    errors.forEach((error) => console.log(`  ERROR: ${error}`));
    throw new Error("Phase 6 QA validation failed");
  }

  console.log("Phase 6 QA validation passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
