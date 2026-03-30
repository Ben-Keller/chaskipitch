import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const ASSIGNMENTS_PATH = path.join(ROOT, "content", "photo-assignments.json");
const COUNTRIES_DIR = path.join(ROOT, "content", "countries");
const SELECTOR_OUTPUT_PATH = path.join(
  ROOT,
  "tools",
  "photo-country-offset-lab",
  "output",
  "photo-country-offset-selections.json"
);
const DEFAULT_Y_OFFSET_LIMIT = 45;

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeYOffset(value, limit) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-limit, Math.min(limit, Math.round(parsed * 100) / 100));
}

function toRuntimeImagePath(photoPath) {
  const raw = String(photoPath ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/runtime/photos/")) {
    return raw;
  }
  if (raw.startsWith("runtime/photos/")) {
    return `/${raw}`;
  }
  if (raw.startsWith("/photos/")) {
    return `/runtime${raw}`;
  }
  if (raw.startsWith("photos/")) {
    return `/runtime/${raw}`;
  }
  return null;
}

function candidateSort(left, right) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt - left.savedAt;
  }
  if (left.sourceTypeWeight !== right.sourceTypeWeight) {
    return right.sourceTypeWeight - left.sourceTypeWeight;
  }
  return left.image.localeCompare(right.image);
}

async function loadCountryIndex() {
  const files = (await fs.readdir(COUNTRIES_DIR)).filter((fileName) => fileName.toLowerCase().endsWith(".json"));
  const records = await Promise.all(
    files.map(async (fileName) => {
      const payload = JSON.parse(await fs.readFile(path.join(COUNTRIES_DIR, fileName), "utf8"));
      const iso3 = String(payload?.iso3 || fileName.replace(/\.json$/i, "")).toUpperCase();
      const name = String(payload?.name || iso3).trim();
      return { iso3, name };
    })
  );
  records.sort((left, right) => left.iso3.localeCompare(right.iso3));
  const isoSet = new Set(records.map((record) => record.iso3));
  const isoByName = new Map(records.map((record) => [normalizeName(record.name), record.iso3]));
  return { records, isoSet, isoByName };
}

function resolveCountryIso(selection, isoSet, isoByName) {
  const isoRaw = String(selection?.country_iso3 || "").toUpperCase();
  const isNA = Boolean(selection?.is_na) || isoRaw === "NA";
  if (isNA) {
    return null;
  }

  if (isoSet.has(isoRaw)) {
    return isoRaw;
  }

  const label = normalizeName(selection?.country_label);
  if (!label) {
    return null;
  }
  return isoByName.get(label) ?? null;
}

function sourceTypeWeight(photoPath) {
  const value = String(photoPath ?? "");
  if (value.includes("/picture/")) {
    return 2;
  }
  if (value.includes("/portrait/")) {
    return 1;
  }
  return 0;
}

async function main() {
  const [assignmentsRaw, selectorRaw, countryIndex] = await Promise.all([
    fs.readFile(ASSIGNMENTS_PATH, "utf8"),
    fs.readFile(SELECTOR_OUTPUT_PATH, "utf8"),
    loadCountryIndex()
  ]);

  const assignments = JSON.parse(assignmentsRaw);
  const selector = JSON.parse(selectorRaw);
  const yOffsetLimit = Number(assignments?.meta?.y_offset_limit) || DEFAULT_Y_OFFSET_LIMIT;

  const existingCountryPhotos =
    assignments?.country_photos && typeof assignments.country_photos === "object"
      ? assignments.country_photos
      : {};

  const dedupedByIsoAndImage = new Map();
  let skippedInvalid = 0;

  for (const selection of Object.values(selector?.selections ?? {})) {
    const iso3 = resolveCountryIso(selection, countryIndex.isoSet, countryIndex.isoByName);
    if (!iso3) {
      skippedInvalid += 1;
      continue;
    }

    const image = toRuntimeImagePath(selection?.photo_path);
    if (!image) {
      skippedInvalid += 1;
      continue;
    }

    const entry = {
      image,
      y_offset: normalizeYOffset(selection?.y_offset, yOffsetLimit),
      savedAt: Number.isFinite(Date.parse(String(selection?.saved_at ?? "")))
        ? Date.parse(String(selection.saved_at))
        : 0,
      source_path: String(selection?.photo_path || ""),
      sourceTypeWeight: sourceTypeWeight(selection?.photo_path)
    };

    const dedupeKey = `${iso3}::${image}`;
    const existing = dedupedByIsoAndImage.get(dedupeKey);
    if (!existing || entry.savedAt >= existing.savedAt) {
      dedupedByIsoAndImage.set(dedupeKey, entry);
    }
  }

  const poolByIso = new Map();
  for (const [key, entry] of dedupedByIsoAndImage.entries()) {
    const iso3 = key.split("::")[0];
    const current = poolByIso.get(iso3) ?? [];
    current.push(entry);
    poolByIso.set(iso3, current);
  }
  for (const [iso3, entries] of poolByIso.entries()) {
    entries.sort(candidateSort);
    poolByIso.set(iso3, entries);
  }

  const mergedCountryPhotos = {};
  const usedPrimaryImages = new Set();
  let updatedCountries = 0;
  let selectedCountries = 0;
  let preservedCountries = 0;

  const countriesWithoutSelection = countryIndex.records.filter(
    (country) => (poolByIso.get(country.iso3) ?? []).length === 0
  );
  const countriesWithSelection = countryIndex.records.filter(
    (country) => (poolByIso.get(country.iso3) ?? []).length > 0
  );

  for (const country of countriesWithoutSelection) {
    const existing = existingCountryPhotos?.[country.iso3] ?? null;
    if (!existing) {
      continue;
    }
    mergedCountryPhotos[country.iso3] = existing;
    if (typeof existing.image === "string" && existing.image.trim()) {
      usedPrimaryImages.add(existing.image);
    }
    preservedCountries += 1;
  }

  for (const country of countriesWithSelection) {
    const iso3 = country.iso3;
    const existing = existingCountryPhotos?.[iso3] ?? null;
    const selectionPool = poolByIso.get(iso3) ?? [];
    const prioritizedPool = [...selectionPool];

    if (typeof existing?.image === "string") {
      const indexOfExisting = prioritizedPool.findIndex((candidate) => candidate.image === existing.image);
      if (indexOfExisting > 0) {
        const [existingCandidate] = prioritizedPool.splice(indexOfExisting, 1);
        prioritizedPool.unshift(existingCandidate);
      }
    }

    const selected =
      prioritizedPool.find((candidate) => !usedPrimaryImages.has(candidate.image)) ?? prioritizedPool[0] ?? null;

    if (!selected) {
      continue;
    }

    selectedCountries += 1;
    mergedCountryPhotos[iso3] = {
      image: selected.image,
      alt:
        typeof existing?.alt === "string" && existing.alt.trim()
          ? existing.alt
          : `Country photo aligned to ${country.name} report context`,
      y_offset: selected.y_offset
    };
    usedPrimaryImages.add(selected.image);

    if (
      existing?.image !== mergedCountryPhotos[iso3].image ||
      Number(existing?.y_offset) !== Number(mergedCountryPhotos[iso3].y_offset)
    ) {
      updatedCountries += 1;
    }
  }

  for (const [iso3, media] of Object.entries(existingCountryPhotos)) {
    if (!Object.prototype.hasOwnProperty.call(mergedCountryPhotos, iso3)) {
      mergedCountryPhotos[iso3] = media;
    }
  }

  const country_photo_pool = {};
  for (const [iso3, entries] of poolByIso.entries()) {
    country_photo_pool[iso3] = entries.map((entry) => ({
      image: entry.image,
      y_offset: entry.y_offset,
      source_path: entry.source_path
    }));
  }

  const existingPool = assignments?.country_photo_pool ?? {};
  const mappingChanged =
    JSON.stringify(existingCountryPhotos) !== JSON.stringify(mergedCountryPhotos) ||
    JSON.stringify(existingPool) !== JSON.stringify(country_photo_pool);

  const summary = {
    selected_countries: selectedCountries,
    updated_countries: updatedCountries,
    preserved_countries: preservedCountries,
    skipped_rows: skippedInvalid
  };

  assignments.country_photos = mergedCountryPhotos;
  assignments.country_photo_pool = country_photo_pool;
  assignments.meta = {
    ...(assignments.meta ?? {}),
    selector_output_file: toPosix(path.relative(ROOT, SELECTOR_OUTPUT_PATH)),
    selector_output_updated_at: selector?.meta?.updated_at ?? selector?.meta?.created_at ?? null,
    selector_merge_updated_at: mappingChanged
      ? new Date().toISOString()
      : assignments?.meta?.selector_merge_updated_at ?? null,
    selector_merge_summary: mappingChanged
      ? summary
      : assignments?.meta?.selector_merge_summary ?? summary
  };

  const serialized = `${JSON.stringify(assignments, null, 2)}\n`;
  if (serialized !== assignmentsRaw && serialized !== `${assignmentsRaw}\n`) {
    await fs.writeFile(ASSIGNMENTS_PATH, serialized, "utf8");
  }

  console.log(
    `Applied selector output to ${selectedCountries} countries (${updatedCountries} updated, ${preservedCountries} preserved, ${skippedInvalid} skipped rows).${mappingChanged ? "" : " No mapping changes detected."}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
