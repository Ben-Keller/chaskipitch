import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(ROOT, "tmp", "platform-text-edits.json");
const DEFAULT_OUTPUT = path.join(ROOT, "tmp", "platform-text-edits-ui.json");

const inputPath = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : DEFAULT_INPUT;
const outputPath = process.argv[3] ? path.resolve(ROOT, process.argv[3]) : DEFAULT_OUTPUT;

const UI_FILE_ALLOWLIST = new Set([
  "src/App.jsx",
  "src/site-header.jsx",
  "src/home-page.jsx",
  "src/our-films-page.jsx",
  "src/creative-pitch-page.jsx",
  "src/story-experience.jsx",
  "src/loading-panel.jsx"
]);

const DASHBOARD_TEXT_ALLOWLIST = new Set([
  "Loading 10 years of progress",
  "Analyzing global impact",
  "Unable to load impact workspace data.",
  "Where Do We Work",
  "Tenure Facility's Global Footprint in 2024",
  "As of December 31, 2024, Tenure Facility supported 35 projects in 18 countries with project preparation grants in 3 countries.",
  "Search countries"
]);

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function allowEntry(entry) {
  const file = String(entry?.file ?? "");
  const text = String(entry?.text ?? "").trim();
  if (!file || !text) {
    return false;
  }

  if (UI_FILE_ALLOWLIST.has(file)) {
    return true;
  }

  if (file === "src/dashboard-page.jsx" && DASHBOARD_TEXT_ALLOWLIST.has(text)) {
    return true;
  }

  return false;
}

async function main() {
  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const sourceEntries = Array.isArray(payload?.entries) ? payload.entries : [];
  const filteredEntries = sourceEntries.filter(allowEntry);

  const nextPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      format_version: 1,
      source_file: toPosix(path.relative(ROOT, inputPath)),
      entry_count: filteredEntries.length,
      scope: "ui_page_copy_only",
      instructions:
        "Edit only `new_text` values for page-level/UI copy. Then run `npm run text:apply -- tmp/platform-text-edits-ui.json`."
    },
    entries: filteredEntries
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");

  console.log(
    `Filtered ${filteredEntries.length} UI text entries to ${toPosix(path.relative(ROOT, outputPath))}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
