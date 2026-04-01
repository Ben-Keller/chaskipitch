import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const GENERATED_PATHS = [
  "data/content/signals",
  "data/content/media/country-videos.json",
  "data/content/media/photo-assignments.json",
  "data/content/geo/world-footprint.geojson",
  "data/content/geo/world-countries.geojson",
  "data/content/geo/authoritative-provenance.json",
  "data/content/manifest.json"
];

async function main() {
  const { stdout } = await execFileAsync("git", [
    "status",
    "--porcelain",
    "--",
    ...GENERATED_PATHS
  ]);

  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    console.log("Generated content check passed: no pending changes.");
    return;
  }

  console.error("Generated content is out of sync. Regenerate and commit these changes:");
  lines.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
