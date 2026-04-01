const EXTERNAL_PROTOCOL_RE = /^(?:[a-z]+:)?\/\//i;

function normalizeBase(baseUrl) {
  const raw = typeof baseUrl === "string" && baseUrl.length ? baseUrl : "/";
  if (raw === "./") {
    return "./";
  }
  return raw.endsWith("/") ? raw : `${raw}/`;
}

const BASE_URL = normalizeBase(import.meta.env.BASE_URL);

function resolveRuntimeBase() {
  if (BASE_URL !== "./") {
    return BASE_URL;
  }

  if (typeof window === "undefined") {
    return "./";
  }

  const hostname = String(window.location?.hostname ?? "").toLowerCase();
  const pathname = String(window.location?.pathname ?? "/");
  if (hostname.endsWith("github.io")) {
    const firstSegment = pathname.split("/").filter(Boolean)[0];
    return firstSegment ? `/${firstSegment}/` : "/";
  }

  return "/";
}

export function withBasePath(pathValue) {
  if (typeof pathValue !== "string" || !pathValue.length) {
    return pathValue;
  }

  if (
    EXTERNAL_PROTOCOL_RE.test(pathValue) ||
    pathValue.startsWith("data:") ||
    pathValue.startsWith("blob:") ||
    pathValue.startsWith("mailto:") ||
    pathValue.startsWith("#")
  ) {
    return pathValue;
  }

  const cleaned = pathValue.replace(/^\/+/, "");

  return `${resolveRuntimeBase()}${cleaned}`;
}

export function contentPath(relativePath) {
  return withBasePath(`runtime/content/${String(relativePath).replace(/^\/+/, "")}`);
}

export function mediaPath(relativePath) {
  return withBasePath(`media/${String(relativePath).replace(/^\/+/, "")}`);
}

export function reportPath(relativePath) {
  return withBasePath(`report/${String(relativePath).replace(/^\/+/, "")}`);
}
