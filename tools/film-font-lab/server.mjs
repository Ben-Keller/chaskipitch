import { createServer } from "node:http";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ROOT = __dirname;
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const OUTPUT_DIR = path.join(APP_ROOT, "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "film-font-selections.json");
const PORT = Number(process.env.PORT || 4391);

const FILMS = [
  {
    id: "wind-within-you",
    title: "The Wind is Within You",
    subtitle: "Kogi Land Reclamation",
    default_font_class: "films2-title-font--kogi"
  },
  {
    id: "pitukiska",
    title: "Pitukiska",
    subtitle: "The Andean New Year",
    default_font_class: "films2-title-font--andean"
  },
  {
    id: "undp60",
    title: "UNDP60",
    subtitle: "Celebrating 60 Years of UNDP",
    default_font_class: "films2-title-font--undp"
  },
  {
    id: "floating-islands",
    title: "Floating Islands",
    subtitle: "Lake Titicaca, Peru",
    default_font_class: "films2-title-font--floating"
  },
  {
    id: "sunflower-kids",
    title: "Sunflower Kids",
    subtitle: "Solar Education in Lesotho",
    default_font_class: "films2-title-font--sunflower"
  }
];

const FONT_OPTIONS = [
  {
    font_class: "films2-title-font--kogi",
    label: "Bebas Neue / Impact"
  },
  {
    font_class: "films2-title-font--andean",
    label: "Brush Script"
  },
  {
    font_class: "films2-title-font--undp",
    label: "Courier Mono"
  },
  {
    font_class: "films2-title-font--floating",
    label: "Copperplate"
  },
  {
    font_class: "films2-title-font--sunflower",
    label: "Didot Serif"
  },
  {
    font_class: "films2-title-font--avenir",
    label: "Avenir Next"
  },
  {
    font_class: "films2-title-font--helvetica",
    label: "Helvetica Neue"
  },
  {
    font_class: "films2-title-font--arial",
    label: "Arial"
  },
  {
    font_class: "films2-title-font--gill-sans",
    label: "Gill Sans"
  },
  {
    font_class: "films2-title-font--futura",
    label: "Futura"
  },
  {
    font_class: "films2-title-font--franklin",
    label: "Franklin Gothic"
  },
  {
    font_class: "films2-title-font--optima",
    label: "Optima"
  },
  {
    font_class: "films2-title-font--trebuchet",
    label: "Trebuchet MS"
  },
  {
    font_class: "films2-title-font--verdana",
    label: "Verdana"
  },
  {
    font_class: "films2-title-font--tahoma",
    label: "Tahoma"
  },
  {
    font_class: "films2-title-font--century-gothic",
    label: "Century Gothic"
  },
  {
    font_class: "films2-title-font--georgia",
    label: "Georgia"
  },
  {
    font_class: "films2-title-font--times",
    label: "Times New Roman"
  },
  {
    font_class: "films2-title-font--garamond",
    label: "Garamond"
  },
  {
    font_class: "films2-title-font--palatino",
    label: "Palatino"
  },
  {
    font_class: "films2-title-font--baskerville",
    label: "Baskerville"
  },
  {
    font_class: "films2-title-font--bodoni",
    label: "Bodoni"
  },
  {
    font_class: "films2-title-font--bookman",
    label: "Bookman"
  },
  {
    font_class: "films2-title-font--rockwell",
    label: "Rockwell"
  },
  {
    font_class: "films2-title-font--american-typewriter",
    label: "American Typewriter"
  },
  {
    font_class: "films2-title-font--courier",
    label: "Courier New"
  },
  {
    font_class: "films2-title-font--monaco",
    label: "Monaco"
  },
  {
    font_class: "films2-title-font--consolas",
    label: "Consolas"
  },
  {
    font_class: "films2-title-font--marker-felt",
    label: "Marker Felt"
  },
  {
    font_class: "films2-title-font--papyrus",
    label: "Papyrus"
  },
  {
    font_class: "films2-title-font--chalkboard",
    label: "Chalkboard"
  },
  {
    font_class: "films2-title-font--comic-sans",
    label: "Comic Sans"
  },
  {
    font_class: "films2-title-font--impact",
    label: "Impact"
  },
  {
    font_class: "films2-title-font--arial-black",
    label: "Arial Black"
  }
];

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

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDecisionStore() {
  if (!(await pathExists(OUTPUT_FILE))) {
    return {
      meta: {
        created_at: new Date().toISOString(),
        app: "film-font-lab"
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
  const store = await readDecisionStore();
  const films = FILMS.map((film) => ({
    id: film.id,
    title: film.title,
    subtitle: film.subtitle,
    default_font_class: film.default_font_class,
    saved_selection: store.selections[film.id] || null
  }));

  const firstUnassignedIndex = films.findIndex((film) => !film.saved_selection);

  return {
    api_version: 1,
    films,
    font_options: FONT_OPTIONS,
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
  const filmId = String(payload?.film_id || "").trim();
  const fontClass = String(payload?.font_class || "").trim();

  if (!filmId) {
    throw new Error("film_id is required");
  }
  if (!fontClass) {
    throw new Error("font_class is required");
  }

  const validFilmIds = new Set(FILMS.map((film) => film.id));
  const validFontClasses = new Set(FONT_OPTIONS.map((option) => option.font_class));

  if (!validFilmIds.has(filmId)) {
    throw new Error(`Unknown film_id '${filmId}'`);
  }
  if (!validFontClasses.has(fontClass)) {
    throw new Error(`Unknown font_class '${fontClass}'`);
  }

  const store = await readDecisionStore();
  store.meta = {
    ...(store.meta || {}),
    app: "film-font-lab",
    updated_at: new Date().toISOString()
  };
  store.selections[filmId] = {
    film_id: filmId,
    font_class: fontClass,
    updated_at: new Date().toISOString()
  };
  await writeDecisionStore(store);

  return {
    saved: store.selections[filmId],
    output_file: toPosix(path.relative(REPO_ROOT, OUTPUT_FILE)),
    output_file_absolute: OUTPUT_FILE
  };
}

async function serveStatic(req, res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, normalized);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) {
      sendError(res, 404, "Not found");
      return;
    }
    const body = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(resolved),
      "Content-Length": body.length
    });
    res.end(body);
  } catch {
    sendError(res, 404, "Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const { pathname } = requestUrl;

    if (pathname === "/api/bootstrap" && req.method === "GET") {
      jsonResponse(res, 200, { ok: true, ...(await readBootstrap()) });
      return;
    }

    if (pathname === "/api/save" && req.method === "POST") {
      const payload = await parseJsonBody(req);
      const saved = await saveSelection(payload);
      jsonResponse(res, 200, { ok: true, ...saved });
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendError(res, 404, "Unknown API route");
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    sendError(res, 500, error?.message || "Unexpected server error");
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[film-font-lab] running at http://localhost:${PORT}`);
});
