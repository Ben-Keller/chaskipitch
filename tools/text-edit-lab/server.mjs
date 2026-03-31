import { createServer } from "node:http";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ROOT = __dirname;
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const PORT = Number(process.env.PORT || 4392);
const HOST = String(process.env.HOST || "127.0.0.1");

function resolveEditFile() {
  const raw = String(process.env.TEXT_EDIT_FILE || "").trim();
  if (!raw) {
    return path.join(REPO_ROOT, "tmp", "platform-text-edits-ui.json");
  }
  return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

const EDIT_FILE = resolveEditFile();

function toPosix(value) {
  return String(value).split(path.sep).join("/");
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

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}");
}

function findFirstPendingIndex(entries) {
  const index = entries.findIndex((entry) => String(entry?.new_text ?? "") === String(entry?.text ?? ""));
  return index >= 0 ? index : 0;
}

function buildSummary(entries) {
  const total = entries.length;
  const remaining = entries.filter((entry) => String(entry?.new_text ?? "") === String(entry?.text ?? "")).length;
  return {
    total,
    remaining,
    completed: Math.max(0, total - remaining)
  };
}

async function readStore() {
  if (!(await pathExists(EDIT_FILE))) {
    throw new Error(
      `Edit file not found at ${toPosix(path.relative(REPO_ROOT, EDIT_FILE))}. Run 'npm run text:export:ui' first.`
    );
  }

  const payload = JSON.parse(await readFile(EDIT_FILE, "utf8"));
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return {
    meta: payload?.meta && typeof payload.meta === "object" ? payload.meta : {},
    entries
  };
}

async function writeStore(store) {
  await mkdir(path.dirname(EDIT_FILE), { recursive: true });
  await writeFile(EDIT_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readBootstrap() {
  const store = await readStore();
  return {
    api_version: 1,
    output_file: toPosix(path.relative(REPO_ROOT, EDIT_FILE)),
    output_file_absolute: EDIT_FILE,
    first_pending_index: findFirstPendingIndex(store.entries),
    summary: buildSummary(store.entries),
    entries: store.entries
  };
}

async function saveEntry(payload) {
  const entryId = String(payload?.id || "").trim();
  if (!entryId) {
    throw new Error("id is required");
  }

  const nextText = String(payload?.new_text ?? "");
  const store = await readStore();
  const index = store.entries.findIndex((entry) => String(entry?.id || "") === entryId);
  if (index < 0) {
    throw new Error(`Entry '${entryId}' not found`);
  }

  store.entries[index] = {
    ...store.entries[index],
    new_text: nextText
  };
  store.meta = {
    ...(store.meta ?? {}),
    updated_at: new Date().toISOString(),
    editor: "text-edit-lab"
  };

  await writeStore(store);

  return {
    saved: store.entries[index],
    output_file: toPosix(path.relative(REPO_ROOT, EDIT_FILE)),
    summary: buildSummary(store.entries),
    first_pending_index: findFirstPendingIndex(store.entries)
  };
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const absolutePath = path.join(PUBLIC_DIR, pathname);
  const normalizedPath = path.normalize(absolutePath);
  if (!normalizedPath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  let stats;
  try {
    stats = await stat(normalizedPath);
  } catch {
    sendError(res, 404, "Not Found");
    return;
  }
  if (!stats.isFile()) {
    sendError(res, 404, "Not Found");
    return;
  }

  const content = await readFile(normalizedPath);
  res.writeHead(200, {
    "Content-Type": contentTypeFor(normalizedPath),
    "Content-Length": content.length
  });
  res.end(content);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      jsonResponse(res, 200, { ok: true, ...(await readBootstrap()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save") {
      const payload = await readBodyJson(req);
      jsonResponse(res, 200, { ok: true, ...(await saveEntry(payload)) });
      return;
    }

    if (req.method !== "GET") {
      sendError(res, 405, "Method Not Allowed");
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    sendError(res, 500, error?.message || String(error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[text-edit-lab] running at http://${HOST}:${PORT}`);
  console.log(`[text-edit-lab] editing file: ${toPosix(path.relative(REPO_ROOT, EDIT_FILE))}`);
});
