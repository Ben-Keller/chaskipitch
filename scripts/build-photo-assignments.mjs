import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const PICTURE_DIR = path.join(ROOT, "assets", "photos", "picture");
const TEXTURE_DIR = path.join(ROOT, "assets", "photos", "texture");
const COUNTRIES_DIR = path.join(ROOT, "data", "content", "countries");
const THEMES_DIR = path.join(ROOT, "data", "content", "themes");
const OUTPUT_PATH = path.join(ROOT, "data", "content", "media", "photo-assignments.json");
const PHOTO_Y_OFFSET_SCRIPT_PATH = path.join(ROOT, "scripts", "estimate-photo-y-offsets.py");
const DEFAULT_SEED = 3959268853;
const RUNTIME_PICTURE_PREFIX = "/runtime/photos/picture/";
const RUNTIME_TEXTURE_PREFIX = "/runtime/photos/texture/";
const DEFAULT_CONTEXT_FRAME_ASPECT_RATIO = 2.45;
const DEFAULT_Y_OFFSET_LIMIT = 45;

function normalizeWebpList(entries) {
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".webp"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let value = Math.imul(t ^ (t >>> 15), 1 | t);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toCountryIso(fileName) {
  return fileName.replace(/\.json$/i, "").toUpperCase();
}

function toThemeSlug(fileName) {
  return fileName.replace(/\.json$/i, "").toLowerCase();
}

function toDisplayCountryName(iso3) {
  return new Intl.DisplayNames(["en"], { type: "region" }).of(iso3) ?? iso3;
}

function resolveSeed() {
  const rawSeed = process.env.PHOTO_ASSIGNMENT_SEED;
  if (!rawSeed) {
    return DEFAULT_SEED;
  }

  const parsed = Number(rawSeed);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid PHOTO_ASSIGNMENT_SEED '${rawSeed}'. Provide a finite numeric value.`
    );
  }

  return parsed;
}

function resolveContextFrameAspectRatio() {
  const raw = process.env.PHOTO_CONTEXT_FRAME_ASPECT_RATIO;
  if (!raw) {
    return DEFAULT_CONTEXT_FRAME_ASPECT_RATIO;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid PHOTO_CONTEXT_FRAME_ASPECT_RATIO '${raw}'. Provide a positive numeric value.`
    );
  }

  return parsed;
}

function resolveYOffsetLimit() {
  const raw = process.env.PHOTO_Y_OFFSET_LIMIT;
  if (!raw) {
    return DEFAULT_Y_OFFSET_LIMIT;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid PHOTO_Y_OFFSET_LIMIT '${raw}'. Provide a positive numeric value.`);
  }

  return parsed;
}

function extractReportPageNumber(countryPayload) {
  const mediaPhotos = countryPayload?.media?.photos;
  if (Array.isArray(mediaPhotos)) {
    for (const candidate of mediaPhotos) {
      const match = /report-page-(\d+)\.jpg/i.exec(String(candidate));
      if (match) {
        return Number(match[1]);
      }
    }
  }
  return null;
}

function parseRuntimeAssetName(runtimePath, runtimePrefix) {
  if (typeof runtimePath !== "string" || !runtimePath.startsWith(runtimePrefix)) {
    return null;
  }
  const fileName = runtimePath.slice(runtimePrefix.length);
  return fileName ? fileName : null;
}

function parsePictureName(runtimePath) {
  return parseRuntimeAssetName(runtimePath, RUNTIME_PICTURE_PREFIX);
}

function parseTextureName(runtimePath) {
  return parseRuntimeAssetName(runtimePath, RUNTIME_TEXTURE_PREFIX);
}

function normalizeYOffset(value, limit) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-limit, Math.min(limit, Math.round(parsed)));
}

async function loadCurrentPayload() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function collectExistingPhotoOffsets(currentPayload, offsetLimit) {
  const offsetByRuntimePath = new Map();

  const register = (entry) => {
    const runtimePath = entry?.image;
    if (typeof runtimePath !== "string" || !runtimePath.trim()) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(entry ?? {}, "y_offset")) {
      return;
    }
    offsetByRuntimePath.set(runtimePath, normalizeYOffset(entry?.y_offset, offsetLimit));
  };

  Object.values(currentPayload?.country_photos ?? {}).forEach(register);
  Object.values(currentPayload?.theme_media ?? {}).forEach(register);

  return offsetByRuntimePath;
}

function toAbsoluteImagePath(runtimePath) {
  const pictureName = parsePictureName(runtimePath);
  if (pictureName) {
    return path.join(PICTURE_DIR, pictureName);
  }

  const textureName = parseTextureName(runtimePath);
  if (textureName) {
    return path.join(TEXTURE_DIR, textureName);
  }

  return null;
}

function estimatePhotoOffsets(runtimePaths, existingOffsets, frameAspectRatio, offsetLimit) {
  const normalizedRuntimePaths = [
    ...new Set(runtimePaths.filter((entry) => typeof entry === "string" && entry.trim()))
  ];
  const offsetByRuntimePath = new Map();
  const preserveExisting = process.env.PHOTO_ASSIGNMENT_PRESERVE_Y_OFFSETS === "1";

  if (preserveExisting) {
    normalizedRuntimePaths.forEach((runtimePath) => {
      if (existingOffsets.has(runtimePath)) {
        offsetByRuntimePath.set(runtimePath, existingOffsets.get(runtimePath));
      }
    });
  }

  const unresolved = normalizedRuntimePaths.filter((runtimePath) => !offsetByRuntimePath.has(runtimePath));
  if (!unresolved.length) {
    return offsetByRuntimePath;
  }

  const items = unresolved
    .map((runtimePath) => {
      const filePath = toAbsoluteImagePath(runtimePath);
      if (!filePath) {
        return null;
      }
      return {
        runtime_path: runtimePath,
        file_path: filePath
      };
    })
    .filter(Boolean);

  if (!items.length) {
    unresolved.forEach((runtimePath) => {
      offsetByRuntimePath.set(runtimePath, 0);
    });
    return offsetByRuntimePath;
  }

  let scannerOffsets = {};
  try {
    const result = spawnSync("python3", [PHOTO_Y_OFFSET_SCRIPT_PATH], {
      input: JSON.stringify({
        items,
        frame_aspect_ratio: frameAspectRatio,
        offset_limit: offsetLimit
      }),
      encoding: "utf8"
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr || `offset scanner exited with status ${result.status}`);
    }

    const payload = JSON.parse(result.stdout || "{}");
    if (payload?.offsets && typeof payload.offsets === "object") {
      scannerOffsets = payload.offsets;
    }
    if (Array.isArray(payload?.warnings) && payload.warnings.length) {
      console.warn(
        `Photo y-offset scanner warnings: ${payload.warnings
          .map((warning) => String(warning))
          .join("; ")}`
      );
    }
  } catch (error) {
    console.warn(
      `Photo y-offset scan failed (${error?.message || error}). Falling back to existing or centered offsets.`
    );
  }

  unresolved.forEach((runtimePath) => {
    const hasScanned = Object.prototype.hasOwnProperty.call(scannerOffsets, runtimePath);
    const scanned = normalizeYOffset(scannerOffsets[runtimePath], offsetLimit);
    const existing = existingOffsets.has(runtimePath)
      ? normalizeYOffset(existingOffsets.get(runtimePath), offsetLimit)
      : 0;
    offsetByRuntimePath.set(runtimePath, hasScanned ? scanned : existing);
  });

  return offsetByRuntimePath;
}

function yOffsetFor(runtimePath, offsetByRuntimePath, offsetLimit) {
  return normalizeYOffset(offsetByRuntimePath.get(runtimePath), offsetLimit);
}

function loadReusableCountryPictureMap(countries, availablePictures, currentPayload) {
  if (!currentPayload || typeof currentPayload !== "object") {
    return null;
  }

  const existing = currentPayload?.country_photos;
  if (!existing || typeof existing !== "object") {
    return null;
  }

  const map = new Map();
  const used = new Set();
  const pictureSet = new Set(availablePictures);

  for (const country of countries) {
    const image = existing[country.iso3]?.image;
    const pictureName = parsePictureName(image);
    if (!pictureName || !pictureSet.has(pictureName) || used.has(pictureName)) {
      return null;
    }
    used.add(pictureName);
    map.set(country.iso3, pictureName);
  }

  return map;
}

async function main() {
  const [pictureEntries, textureEntries, countryEntries, themeEntries] = await Promise.all([
    fs.readdir(PICTURE_DIR, { withFileTypes: true }),
    fs.readdir(TEXTURE_DIR, { withFileTypes: true }),
    fs.readdir(COUNTRIES_DIR, { withFileTypes: true }),
    fs.readdir(THEMES_DIR, { withFileTypes: true })
  ]);

  const pictures = normalizeWebpList(pictureEntries);
  const textures = normalizeWebpList(textureEntries);
  const countries = await Promise.all(
    countryEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map(async (entry) => {
        const countryPath = path.join(COUNTRIES_DIR, entry.name);
        const payload = JSON.parse(await fs.readFile(countryPath, "utf8"));
        const iso3 = toCountryIso(entry.name);
        const page = extractReportPageNumber(payload);
        const displayName =
          typeof payload?.name === "string" && payload.name.trim()
            ? payload.name.trim()
            : toDisplayCountryName(iso3);
        return { iso3, displayName, page };
      })
  );
  countries.sort((a, b) => a.iso3.localeCompare(b.iso3));
  const themes = themeEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => toThemeSlug(entry.name))
    .sort((a, b) => a.localeCompare(b));

  if (!pictures.length) {
    throw new Error("No .webp files found in assets/photos/picture");
  }
  if (!textures.length) {
    throw new Error("No .webp files found in assets/photos/texture");
  }

  const seed = resolveSeed();
  const frameAspectRatio = resolveContextFrameAspectRatio();
  const yOffsetLimit = resolveYOffsetLimit();
  const currentPayload = await loadCurrentPayload();
  const random = mulberry32(seed);
  const shuffledPicturesForCountries = shuffle(pictures, random);
  const shuffledTexturesForThemes = shuffle(textures, random);
  const reusableCountryPictureMap = loadReusableCountryPictureMap(countries, pictures, currentPayload);
  const countryPictureMap = reusableCountryPictureMap ?? new Map();

  if (!reusableCountryPictureMap) {
    countries.forEach((country, index) => {
      countryPictureMap.set(
        country.iso3,
        shuffledPicturesForCountries[index % shuffledPicturesForCountries.length]
      );
    });
  }

  const usedCountryPictures = new Set(countryPictureMap.values());
  const candidateThemePictures = pictures.filter((picture) => !usedCountryPictures.has(picture));
  const themePicturePool = candidateThemePictures.length ? candidateThemePictures : pictures;
  const shuffledPicturesForThemes = shuffle(themePicturePool, random);

  const countryRuntimeImages = countries.map(
    (country) => `${RUNTIME_PICTURE_PREFIX}${countryPictureMap.get(country.iso3)}`
  );
  const themeRuntimeImages = themes.map(
    (_, index) => `${RUNTIME_PICTURE_PREFIX}${shuffledPicturesForThemes[index % shuffledPicturesForThemes.length]}`
  );
  const existingOffsets = collectExistingPhotoOffsets(currentPayload, yOffsetLimit);
  const offsetByRuntimePath = estimatePhotoOffsets(
    [...countryRuntimeImages, ...themeRuntimeImages],
    existingOffsets,
    frameAspectRatio,
    yOffsetLimit
  );

  const country_photos = {};
  countries.forEach((country) => {
    const image = countryPictureMap.get(country.iso3);
    const runtimeImagePath = `${RUNTIME_PICTURE_PREFIX}${image}`;
    const pageLabel = Number.isFinite(country.page) ? ` (page ${country.page})` : "";
    country_photos[country.iso3] = {
      image: runtimeImagePath,
      alt: `Country photo aligned to ${country.displayName} report context${pageLabel}`,
      y_offset: yOffsetFor(runtimeImagePath, offsetByRuntimePath, yOffsetLimit)
    };
  });

  const theme_media = {};
  themes.forEach((slug, index) => {
    const image = shuffledPicturesForThemes[index % shuffledPicturesForThemes.length];
    const texture = shuffledTexturesForThemes[index % shuffledTexturesForThemes.length];
    const runtimeImagePath = `${RUNTIME_PICTURE_PREFIX}${image}`;
    theme_media[slug] = {
      image: runtimeImagePath,
      texture: `${RUNTIME_TEXTURE_PREFIX}${texture}`,
      alt: `Placeholder thematic image for ${slug.replaceAll("-", " ")}`,
      y_offset: yOffsetFor(runtimeImagePath, offsetByRuntimePath, yOffsetLimit)
    };
  });

  const payload = {
    meta: {
      random_seed: seed,
      context_frame_aspect_ratio: frameAspectRatio,
      y_offset_limit: yOffsetLimit,
      note: reusableCountryPictureMap
        ? "Country photo assignments preserved from existing curated mapping; theme media generated from remaining /photos assets; y_offset defaults estimated from image saliency."
        : "Deterministic placeholder assignments generated from /photos assets with y_offset defaults estimated from image saliency."
    },
    country_photos,
    theme_media
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with seed ${seed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
