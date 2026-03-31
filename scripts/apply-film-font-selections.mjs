import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SELECTOR_OUTPUT_PATH = path.join(
  ROOT,
  "tools",
  "film-font-lab",
  "output",
  "film-font-selections.json"
);
const TARGET_PATH = path.join(ROOT, "src", "config", "film-font-overrides.json");

const VALID_FILM_IDS = new Set([
  "wind-within-you",
  "pitukiska",
  "undp60",
  "floating-islands",
  "sunflower-kids"
]);

const VALID_FONT_CLASS = /^films2-title-font--[a-z0-9-]+$/;

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function normalizeFontClass(value) {
  const normalized = String(value ?? "").trim();
  if (!VALID_FONT_CLASS.test(normalized)) {
    return null;
  }
  return normalized;
}

async function main() {
  const [selectorRaw, targetRaw] = await Promise.all([
    fs.readFile(SELECTOR_OUTPUT_PATH, "utf8"),
    fs.readFile(TARGET_PATH, "utf8").catch(() => "")
  ]);

  const selector = JSON.parse(selectorRaw);
  const selections =
    selector?.selections && typeof selector.selections === "object" ? selector.selections : {};

  const overrides = {};
  let applied = 0;
  let skipped = 0;

  for (const [filmIdRaw, record] of Object.entries(selections)) {
    const filmId = String(filmIdRaw || "").trim();
    const fontClass = normalizeFontClass(record?.font_class);

    if (!VALID_FILM_IDS.has(filmId) || !fontClass) {
      skipped += 1;
      continue;
    }

    overrides[filmId] = fontClass;
    applied += 1;
  }

  const payload = {
    meta: {
      source_file: toPosix(path.relative(ROOT, SELECTOR_OUTPUT_PATH)),
      source_updated_at: selector?.meta?.updated_at ?? selector?.meta?.created_at ?? null,
      applied_at: new Date().toISOString(),
      applied_count: applied,
      skipped_count: skipped
    },
    overrides
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (serialized !== targetRaw && serialized !== `${targetRaw}\n`) {
    await fs.mkdir(path.dirname(TARGET_PATH), { recursive: true });
    await fs.writeFile(TARGET_PATH, serialized, "utf8");
  }

  console.log(
    `Applied ${applied} film font overrides (${skipped} skipped) to ${toPosix(
      path.relative(ROOT, TARGET_PATH)
    )}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
