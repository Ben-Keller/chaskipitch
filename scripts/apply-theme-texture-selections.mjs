import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const ASSIGNMENTS_PATH = path.join(ROOT, "content", "photo-assignments.json");
const THEMES_DIR = path.join(ROOT, "content", "themes");
const TEXTURES_DIR = path.join(ROOT, "photos", "texture");
const SELECTOR_OUTPUT_PATH = path.join(
  ROOT,
  "tools",
  "theme-texture-lab",
  "output",
  "theme-texture-selections.json"
);

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function toRuntimeTexturePath(texturePath) {
  const raw = String(texturePath ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/runtime/photos/texture/")) {
    return raw;
  }
  if (raw.startsWith("runtime/photos/texture/")) {
    return `/${raw}`;
  }
  if (raw.startsWith("/photos/texture/")) {
    return `/runtime${raw}`;
  }
  if (raw.startsWith("photos/texture/")) {
    return `/runtime/${raw}`;
  }

  return null;
}

async function loadThemeSlugs() {
  const files = await fs.readdir(THEMES_DIR);
  return new Set(
    files
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .map((name) => name.replace(/\.json$/i, "").toLowerCase())
  );
}

async function loadTexturePaths() {
  const entries = await fs.readdir(TEXTURES_DIR, { withFileTypes: true });
  const validExtensions = new Set([".webp", ".png", ".jpg", ".jpeg", ".avif"]);
  return new Set(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => validExtensions.has(path.extname(name).toLowerCase()))
      .map((name) => toPosix(path.join("photos", "texture", name)))
  );
}

async function main() {
  const [assignmentsRaw, selectorRaw, validThemeSlugs, validTexturePaths] = await Promise.all([
    fs.readFile(ASSIGNMENTS_PATH, "utf8"),
    fs.readFile(SELECTOR_OUTPUT_PATH, "utf8"),
    loadThemeSlugs(),
    loadTexturePaths()
  ]);

  const assignments = JSON.parse(assignmentsRaw);
  const selector = JSON.parse(selectorRaw);
  const selections =
    selector?.selections && typeof selector.selections === "object" ? selector.selections : {};

  const nextThemeMedia = {
    ...(assignments?.theme_media && typeof assignments.theme_media === "object"
      ? assignments.theme_media
      : {})
  };

  let applied = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const [rawSlug, record] of Object.entries(selections)) {
    const slug = String(rawSlug || "").trim().toLowerCase();
    const texturePath = toPosix(String(record?.texture_path || "").trim());
    if (!slug || !texturePath) {
      skipped += 1;
      continue;
    }
    if (!validThemeSlugs.has(slug)) {
      skipped += 1;
      continue;
    }
    if (!validTexturePaths.has(texturePath)) {
      skipped += 1;
      continue;
    }

    const runtimeTexture = toRuntimeTexturePath(texturePath);
    if (!runtimeTexture) {
      skipped += 1;
      continue;
    }

    const current = nextThemeMedia?.[slug];
    if (!current || typeof current !== "object") {
      skipped += 1;
      continue;
    }

    if (current.texture === runtimeTexture) {
      unchanged += 1;
      continue;
    }

    nextThemeMedia[slug] = {
      ...current,
      texture: runtimeTexture
    };
    applied += 1;
  }

  assignments.theme_media = nextThemeMedia;
  assignments.meta = {
    ...(assignments.meta ?? {}),
    theme_texture_selector_output_file: toPosix(path.relative(ROOT, SELECTOR_OUTPUT_PATH)),
    theme_texture_selector_updated_at: selector?.meta?.updated_at ?? selector?.meta?.created_at ?? null,
    theme_texture_merge_updated_at: new Date().toISOString(),
    theme_texture_merge_summary: {
      applied,
      unchanged,
      skipped
    }
  };

  const serialized = `${JSON.stringify(assignments, null, 2)}\n`;
  if (serialized !== assignmentsRaw && serialized !== `${assignmentsRaw}\n`) {
    await fs.writeFile(ASSIGNMENTS_PATH, serialized, "utf8");
  }

  console.log(
    `Applied ${applied} theme textures (${unchanged} unchanged, ${skipped} skipped) to ${path.relative(ROOT, ASSIGNMENTS_PATH)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
