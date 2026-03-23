import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const PICTURE_DIR = path.join(ROOT, "photos", "picture");
const TEXTURE_DIR = path.join(ROOT, "photos", "texture");
const COUNTRIES_DIR = path.join(ROOT, "content", "countries");
const THEMES_DIR = path.join(ROOT, "content", "themes");
const OUTPUT_PATH = path.join(ROOT, "content", "photo-assignments.json");

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

async function main() {
  const [pictureEntries, textureEntries, countryEntries, themeEntries] = await Promise.all([
    fs.readdir(PICTURE_DIR, { withFileTypes: true }),
    fs.readdir(TEXTURE_DIR, { withFileTypes: true }),
    fs.readdir(COUNTRIES_DIR, { withFileTypes: true }),
    fs.readdir(THEMES_DIR, { withFileTypes: true })
  ]);

  const pictures = normalizeWebpList(pictureEntries);
  const textures = normalizeWebpList(textureEntries);
  const countries = countryEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => toCountryIso(entry.name))
    .sort((a, b) => a.localeCompare(b));
  const themes = themeEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => toThemeSlug(entry.name))
    .sort((a, b) => a.localeCompare(b));

  if (!pictures.length) {
    throw new Error("No .webp files found in photos/picture");
  }
  if (!textures.length) {
    throw new Error("No .webp files found in photos/texture");
  }

  const seed = Math.floor(Math.random() * 0xffffffff);
  const random = mulberry32(seed);
  const shuffledPicturesForCountries = shuffle(pictures, random);
  const shuffledPicturesForThemes = shuffle(pictures, random);
  const shuffledTexturesForThemes = shuffle(textures, random);

  const country_photos = {};
  countries.forEach((iso3, index) => {
    const image = shuffledPicturesForCountries[index % shuffledPicturesForCountries.length];
    country_photos[iso3] = {
      image: `/photos/picture/${image}`,
      alt: `Placeholder photo assignment for ${iso3}`
    };
  });

  const theme_media = {};
  themes.forEach((slug, index) => {
    const image = shuffledPicturesForThemes[index % shuffledPicturesForThemes.length];
    const texture = shuffledTexturesForThemes[index % shuffledTexturesForThemes.length];
    theme_media[slug] = {
      image: `/photos/picture/${image}`,
      texture: `/photos/texture/${texture}`,
      alt: `Placeholder thematic image for ${slug.replaceAll("-", " ")}`
    };
  });

  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      random_seed: seed,
      note: "Random placeholder assignments generated from /photos assets."
    },
    country_photos,
    theme_media
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with seed ${seed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
