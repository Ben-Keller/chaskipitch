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
const OUTPUT_FILE = path.join(OUTPUT_DIR, "photo-country-offset-selections.json");
const PHOTO_ASSIGNMENTS_FILE = path.join(REPO_ROOT, "content", "photo-assignments.json");
const COUNTRY_DIR = path.join(REPO_ROOT, "content", "countries");
const PORT = Number(process.env.PORT || 4388);

const PHOTO_SOURCE_DIRS = [
  path.join(REPO_ROOT, "photos", "picture"),
  path.join(REPO_ROOT, "photos", "portrait")
];

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

const SLICE_Y_OFFSETS = [-45, -15, 15, 45];
const SLICE_INDEXES = [0, 1, 2, 3];
const SLICE_COMBINATIONS = (() => {
  const combos = [];
  for (let mask = 1; mask < 1 << SLICE_INDEXES.length; mask += 1) {
    const indexes = [];
    for (let bit = 0; bit < SLICE_INDEXES.length; bit += 1) {
      if (mask & (1 << bit)) {
        indexes.push(bit);
      }
    }
    const average =
      Math.round((indexes.reduce((sum, index) => sum + SLICE_Y_OFFSETS[index], 0) / indexes.length) * 100) / 100;
    combos.push({ indexes, average });
  }
  return combos;
})();
const NA_ALIASES = new Set(["na", "n/a", "not applicable", "not mapped", "none"]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
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

async function collectImageFiles(dirPath, output = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectImageFiles(fullPath, output);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      continue;
    }
    const relativePath = toPosix(path.relative(REPO_ROOT, fullPath));
    output.push(relativePath);
  }
  return output;
}

function runtimeImageToRepoPath(runtimePath) {
  const raw = String(runtimePath || "").trim();
  if (!raw) {
    return "";
  }
  const cleaned = raw.replace(/^\/+/, "");
  if (cleaned.startsWith("runtime/photos/")) {
    return cleaned.replace(/^runtime\//, "");
  }
  return cleaned;
}

async function readCountries() {
  const files = (await readdir(COUNTRY_DIR)).filter((name) => name.toLowerCase().endsWith(".json"));
  const records = [];

  for (const fileName of files) {
    const payload = JSON.parse(await readFile(path.join(COUNTRY_DIR, fileName), "utf8"));
    records.push({
      iso3: String(payload.iso3 || "").toUpperCase(),
      name: String(payload.name || payload.iso3 || "").trim(),
      project_count: Number(payload.project_count || 0),
      status: String(payload.status || "").trim()
    });
  }

  records.sort((a, b) => a.name.localeCompare(b.name));

  const nameByIso3 = Object.fromEntries(records.map((record) => [record.iso3, record.name]));

  return { countries: records, nameByIso3 };
}

async function readCurrentAssignments(countryNameByIso3) {
  const assignmentsRaw = JSON.parse(await readFile(PHOTO_ASSIGNMENTS_FILE, "utf8"));
  const currentByPhotoPath = {};

  const countryPhotos = assignmentsRaw?.country_photos || {};
  for (const [iso3Raw, media] of Object.entries(countryPhotos)) {
    const iso3 = String(iso3Raw || "").toUpperCase();
    const repoPath = runtimeImageToRepoPath(media?.image);
    if (!repoPath) {
      continue;
    }
    currentByPhotoPath[repoPath] = {
      iso3,
      country_name: countryNameByIso3[iso3] || iso3,
      y_offset: Number(media?.y_offset || 0),
      alt: String(media?.alt || "")
    };
  }

  return currentByPhotoPath;
}

async function readDecisionStore() {
  const exists = await pathExists(OUTPUT_FILE);
  if (!exists) {
    return {
      meta: {
        created_at: new Date().toISOString(),
        app: "photo-country-offset-lab"
      },
      selections: {}
    };
  }

  const parsed = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
  return {
    meta: parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : {},
    selections: parsed?.selections && typeof parsed.selections === "object" ? parsed.selections : {}
  };
}

async function writeDecisionStore(store) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readBootstrap() {
  const { countries, nameByIso3 } = await readCountries();
  const currentByPhotoPath = await readCurrentAssignments(nameByIso3);
  const store = await readDecisionStore();

  const photos = [];
  for (const sourceDir of PHOTO_SOURCE_DIRS) {
    if (!(await pathExists(sourceDir))) {
      continue;
    }
    await collectImageFiles(sourceDir, photos);
  }

  const uniquePhotos = [...new Set(photos)].sort((a, b) => a.localeCompare(b));

  const photoRows = uniquePhotos.map((photoPath) => ({
    photo_path: photoPath,
    file_name: path.basename(photoPath),
    current_assignment: currentByPhotoPath[photoPath] || null,
    saved_selection: store.selections[photoPath] || null
  }));

  return {
    api_version: 2,
    photos: photoRows,
    countries,
    project_countries: countries,
    output_file: toPosix(path.relative(REPO_ROOT, OUTPUT_FILE)),
    output_file_absolute: OUTPUT_FILE,
    allowed_y_offsets: SLICE_Y_OFFSETS,
    total: photoRows.length
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
  for await (const chunk of req) {
    chunks.push(chunk);
    if (chunks.reduce((sum, part) => sum + part.length, 0) > 1_000_000) {
      throw new Error("Payload too large");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function saveSelection(payload) {
  const photoPath = String(payload?.photo_path || "").trim();
  const countryIso3Raw = String(payload?.country_iso3 || "").trim().toUpperCase();
  const countryLabelRaw = String(payload?.country_label || "").trim();
  const yOffsetFromPayload = Number(payload?.y_offset);
  const rawSliceIndexes = Array.isArray(payload?.slice_indexes)
    ? payload.slice_indexes
    : Number.isInteger(payload?.slice_index)
      ? [payload.slice_index]
      : [];
  const sliceIndexes = [...new Set(rawSliceIndexes.map((value) => Number(value)))].sort((a, b) => a - b);

  if (!photoPath) {
    throw new Error("photo_path is required");
  }
  const normalizedCountryLabelRaw = countryLabelRaw.toLowerCase();
  const isNA =
    Boolean(payload?.is_na) ||
    countryIso3Raw === "NA" ||
    NA_ALIASES.has(normalizedCountryLabelRaw);

  const countryIso3 = isNA ? "NA" : (countryIso3Raw || null);
  const countryLabel = isNA ? "NA" : countryLabelRaw;

  if (!countryLabel && !isNA) {
    throw new Error("country_label is required");
  }
  if (sliceIndexes.length && !sliceIndexes.every((index) => SLICE_INDEXES.includes(index))) {
    throw new Error("slice_indexes must contain only values 0, 1, 2, or 3");
  }

  let normalizedSliceIndexes = sliceIndexes;
  let yOffset = null;

  if (normalizedSliceIndexes.length) {
    yOffset =
      Math.round(
        (normalizedSliceIndexes.reduce((sum, index) => sum + SLICE_Y_OFFSETS[index], 0) /
          normalizedSliceIndexes.length) *
          100
      ) / 100;
  } else if (Number.isFinite(yOffsetFromPayload)) {
    yOffset = Math.round(yOffsetFromPayload * 100) / 100;
    const nearestCombo = SLICE_COMBINATIONS.reduce((best, combo) => {
      const delta = Math.abs(combo.average - yOffset);
      if (!best || delta < best.delta) {
        return { delta, combo };
      }
      return best;
    }, null);
    normalizedSliceIndexes = nearestCombo ? nearestCombo.combo.indexes : [];
  } else if (isNA) {
    yOffset = null;
    normalizedSliceIndexes = [];
  } else {
    throw new Error("Provide either slice_indexes or a numeric y_offset");
  }

  const store = await readDecisionStore();
  store.meta = {
    ...store.meta,
    updated_at: new Date().toISOString(),
    app: "photo-country-offset-lab"
  };

  store.selections[photoPath] = {
    photo_path: photoPath,
    country_iso3: countryIso3,
    country_label: countryLabel,
    y_offset: yOffset,
    slice_indexes: normalizedSliceIndexes,
    is_na: isNA,
    saved_at: new Date().toISOString()
  };

  await writeDecisionStore(store);

  return {
    photo_path: photoPath,
    saved: store.selections[photoPath],
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

    sendError(res, 405, "Method not allowed");
  } catch (error) {
    sendError(res, 500, error instanceof Error ? error.message : "Unexpected server error");
  }
});

server.listen(PORT, () => {
  console.log(`Photo country-offset lab running at http://localhost:${PORT}`);
  console.log(`Selections are written to ${OUTPUT_FILE}`);
});
