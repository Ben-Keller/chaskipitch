import { createServer } from "node:http";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ROOT = __dirname;
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const OUTPUT_DIR = path.join(APP_ROOT, "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "theme-texture-selections.json");
const THEMES_DIR = path.join(REPO_ROOT, "content", "themes");
const TEXTURES_DIR = path.join(REPO_ROOT, "photos", "texture");
const PHOTO_ASSIGNMENTS_FILE = path.join(REPO_ROOT, "content", "photo-assignments.json");
const PORT = Number(process.env.PORT || 4390);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}

function displayThemeNameFromSlug(slug) {
  return String(slug)
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function runtimeTextureToRepoPath(runtimePath) {
  const raw = String(runtimePath || "").trim();
  if (!raw) {
    return null;
  }
  if (raw.startsWith("/runtime/photos/texture/")) {
    return raw.replace(/^\/runtime\//, "");
  }
  if (raw.startsWith("runtime/photos/texture/")) {
    return raw.replace(/^runtime\//, "");
  }
  if (raw.startsWith("/photos/texture/")) {
    return raw.replace(/^\//, "");
  }
  if (raw.startsWith("photos/texture/")) {
    return raw;
  }
  return null;
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  jsonResponse(res, statusCode, { ok: false, error: message });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectTextures() {
  const entries = await readdir(TEXTURES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => toPosix(path.join("photos", "texture", entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

async function readThemes() {
  const entries = await readdir(THEMES_DIR, { withFileTypes: true });
  const themes = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }
    const slug = entry.name.replace(/\.json$/i, "").toLowerCase();
    const payload = JSON.parse(await readFile(path.join(THEMES_DIR, entry.name), "utf8"));
    themes.push({
      slug,
      name: String(payload?.name || displayThemeNameFromSlug(slug)).trim()
    });
  }

  themes.sort((left, right) => left.name.localeCompare(right.name));
  return themes;
}

async function readCurrentThemeTextures() {
  try {
    const payload = JSON.parse(await readFile(PHOTO_ASSIGNMENTS_FILE, "utf8"));
    const themeMedia = payload?.theme_media && typeof payload.theme_media === "object" ? payload.theme_media : {};
    const currentByTheme = {};
    for (const [slug, media] of Object.entries(themeMedia)) {
      const texturePath = runtimeTextureToRepoPath(media?.texture);
      if (texturePath) {
        currentByTheme[slug] = texturePath;
      }
    }
    return currentByTheme;
  } catch {
    return {};
  }
}

async function readDecisionStore() {
  if (!(await pathExists(OUTPUT_FILE))) {
    return {
      meta: {
        created_at: new Date().toISOString(),
        app: "theme-texture-lab"
      },
      selections: {}
    };
  }

  const payload = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
  return {
    meta: payload?.meta && typeof payload.meta === "object" ? payload.meta : {},
    selections: payload?.selections && typeof payload.selections === "object" ? payload.selections : {}
  };
}

async function writeDecisionStore(store) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readBootstrap() {
  const [themes, textures, currentByTheme, store] = await Promise.all([
    readThemes(),
    collectTextures(),
    readCurrentThemeTextures(),
    readDecisionStore()
  ]);

  const themesWithMapping = themes.map((theme) => ({
    slug: theme.slug,
    name: theme.name,
    current_texture: currentByTheme[theme.slug] || null,
    saved_selection: store.selections[theme.slug] || null
  }));

  const firstUnassignedIndex = themesWithMapping.findIndex((theme) => !theme.saved_selection);

  return {
    api_version: 1,
    themes: themesWithMapping,
    textures,
    first_unassigned_index: firstUnassignedIndex >= 0 ? firstUnassignedIndex : 0,
    output_file: toPosix(path.relative(REPO_ROOT, OUTPUT_FILE)),
    output_file_absolute: OUTPUT_FILE
  };
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".avif") return "image/avif";
  return "application/octet-stream";
}

async function parseJsonBody(req) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    totalSize += chunk.length;
    if (totalSize > 1_000_000) {
      throw new Error("Payload too large");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function saveSelection(payload) {
  const themeSlug = String(payload?.theme_slug || "").trim().toLowerCase();
  const texturePath = toPosix(String(payload?.texture_path || "").trim());

  if (!themeSlug) {
    throw new Error("theme_slug is required");
  }
  if (!texturePath) {
    throw new Error("texture_path is required");
  }

  const [themes, textures] = await Promise.all([readThemes(), collectTextures()]);
  const validThemeSlugs = new Set(themes.map((theme) => theme.slug));
  const validTexturePaths = new Set(textures);

  if (!validThemeSlugs.has(themeSlug)) {
    throw new Error(`Unknown theme_slug '${themeSlug}'`);
  }
  if (!validTexturePaths.has(texturePath)) {
    throw new Error(`Unknown texture_path '${texturePath}'`);
  }

  const store = await readDecisionStore();
  store.meta = {
    ...store.meta,
    app: "theme-texture-lab",
    updated_at: new Date().toISOString()
  };
  store.selections[themeSlug] = {
    theme_slug: themeSlug,
    texture_path: texturePath,
    saved_at: new Date().toISOString()
  };

  await writeDecisionStore(store);
  return {
    theme_slug: themeSlug,
    saved: store.selections[themeSlug],
    output_file: toPosix(path.relative(REPO_ROOT, OUTPUT_FILE))
  };
}

async function serveFile(res, filePath) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    sendError(res, 404, "Not found");
    return;
  }
  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Content-Length": body.length,
    "Cache-Control": "no-cache"
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "GET" && pathname === "/api/bootstrap") {
      const payload = await readBootstrap();
      jsonResponse(res, 200, { ok: true, ...payload });
      return;
    }

    if (req.method === "POST" && pathname === "/api/save") {
      const body = await parseJsonBody(req);
      const saved = await saveSelection(body);
      jsonResponse(res, 200, { ok: true, ...saved });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/asset/")) {
      const assetRelativePath = pathname.replace(/^\/asset\//, "");
      const target = path.resolve(REPO_ROOT, assetRelativePath);
      if (!target.startsWith(REPO_ROOT + path.sep) && target !== REPO_ROOT) {
        sendError(res, 403, "Invalid asset path");
        return;
      }
      if (!(await pathExists(target))) {
        sendError(res, 404, "Asset not found");
        return;
      }
      await serveFile(res, target);
      return;
    }

    if (req.method === "GET") {
      const publicRelative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      const target = path.resolve(PUBLIC_DIR, publicRelative);
      if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
        sendError(res, 403, "Invalid path");
        return;
      }
      if (!(await pathExists(target))) {
        sendError(res, 404, "Not found");
        return;
      }
      await serveFile(res, target);
      return;
    }

    sendError(res, 404, "Route not found");
  } catch (error) {
    sendError(res, 500, error?.message || "Unexpected server error");
  }
});

server.listen(PORT, () => {
  console.log(`Theme Texture Lab running at http://localhost:${PORT}`);
  console.log(`Writing selections to ${OUTPUT_FILE}`);
});
