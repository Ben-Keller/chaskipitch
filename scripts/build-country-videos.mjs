import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "source", "videos.json");
const COUNTRIES_DIR = path.join(ROOT, "data", "content", "countries");
const OUTPUT_PATH = path.join(ROOT, "data", "content", "media", "country-videos.json");

const COUNTRY_ALIASES = {
  BFA: ["burkina faso", "burkina"],
  BLZ: ["belize"],
  BOL: ["bolivia"],
  BRA: ["brazil", "belem", "belem call", "amazon", "piaui", "babassu", "babacu"],
  CMR: ["cameroon"],
  COD: ["democratic republic of the congo", "democratic republic of congo", "dr congo", "drc", "rdc"],
  COG: ["congo brazzaville", "congo-brazzaville", "congo brazzaville"],
  COL: ["colombia"],
  ECU: ["ecuador"],
  GTM: ["guatemala"],
  GUY: ["guyana"],
  IDN: ["indonesia", "papua"],
  IND: ["india"],
  KEN: ["kenya"],
  KHM: ["cambodia"],
  LBR: ["liberia"],
  MLI: ["mali"],
  MMR: ["myanmar", "burma"],
  NPL: ["nepal"],
  PAN: ["panama"],
  PER: ["peru"],
  SUR: ["suriname"]
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAlias(text, alias) {
  const pattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
  return pattern.test(text);
}

function scoreMatch(titleText, bodyText, aliases) {
  let score = 0;
  const matchTerms = new Set();

  aliases.forEach((alias) => {
    if (hasAlias(titleText, alias)) {
      score += 3;
      matchTerms.add(alias);
    }
    if (hasAlias(bodyText, alias)) {
      score += 1;
      matchTerms.add(alias);
    }
  });

  return {
    score,
    matchTerms: [...matchTerms]
  };
}

function toEmbedUrl(video) {
  if (video.video_id) {
    return `https://www.youtube.com/embed/${video.video_id}`;
  }

  const raw = String(video.video_url ?? "");
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    const id = parsed.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : raw;
  } catch {
    return raw;
  }
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

async function readCountries() {
  const entries = await fs.readdir(COUNTRIES_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);

  const countries = await Promise.all(
    files.map(async (file) => {
      const payload = JSON.parse(await fs.readFile(path.join(COUNTRIES_DIR, file), "utf8"));
      return {
        iso3: payload.iso3,
        name: payload.name
      };
    })
  );

  return countries.sort((a, b) => a.iso3.localeCompare(b.iso3));
}

async function main() {
  const videos = JSON.parse(await fs.readFile(INPUT_PATH, "utf8"));
  const countries = await readCountries();

  const videosByIso = Object.fromEntries(countries.map((country) => [country.iso3, []]));

  videos.forEach((video) => {
    const titleText = normalize(video.title);
    const bodyText = normalize(`${video.title ?? ""} ${video.description ?? ""}`);

    countries.forEach((country) => {
      const baseAliases = country.iso3 === "COG" ? [] : [normalize(country.name)];
      const extraAliases = (COUNTRY_ALIASES[country.iso3] ?? []).map(normalize);
      const aliases = [...new Set([...baseAliases, ...extraAliases])];
      const { score, matchTerms } = scoreMatch(titleText, bodyText, aliases);

      if (score <= 0) {
        return;
      }

      videosByIso[country.iso3].push({
        video_id: video.video_id,
        title: video.title,
        description: video.description,
        url: String(video.video_url ?? ""),
        embed_url: toEmbedUrl(video),
        thumbnail: video.thumb_high || video.thumb_medium || video.thumb_default || "",
        published_at: video.published_at || null,
        score,
        match_terms: matchTerms
      });
    });
  });

  const dedupedAndSorted = Object.fromEntries(
    Object.entries(videosByIso).map(([iso3, rows]) => {
      const unique = new Map();

      rows.forEach((row) => {
        const key = row.video_id || row.url || row.title;
        const existing = unique.get(key);
        if (!existing || row.score > existing.score) {
          unique.set(key, row);
        }
      });

      const sorted = [...unique.values()]
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return toTimestamp(b.published_at) - toTimestamp(a.published_at);
        })
        .slice(0, 8);

      return [iso3, sorted];
    })
  );

  const globalRecent = videos
    .map((video) => ({
      video_id: video.video_id,
      title: video.title,
      description: video.description,
      url: String(video.video_url ?? ""),
      embed_url: toEmbedUrl(video),
      thumbnail: video.thumb_high || video.thumb_medium || video.thumb_default || "",
      published_at: video.published_at || null,
      score: 0,
      match_terms: []
    }))
    .filter((video) => video.title && (video.url || video.embed_url))
    .sort((a, b) => toTimestamp(b.published_at) - toTimestamp(a.published_at))
    .slice(0, 12);

  const result = {
    source_file: "data/source/videos.json",
    matching_notes: "Matched by country aliases in title and description. Scores: title +3, description +1.",
    global_recent: globalRecent,
    by_iso3: dedupedAndSorted
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
