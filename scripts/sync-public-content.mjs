import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "content");
const RUNTIME_ROOT = path.join(ROOT, "public", "runtime");
const DEST = path.join(RUNTIME_ROOT, "content");
const CREATIVE_PITCH_ASSET_SOURCE = path.join(ROOT, "creative-pitch", "assets");
const CREATIVE_PITCH_PUBLIC_DIR = path.join(RUNTIME_ROOT, "creative-pitch");
const CREATIVE_PITCH_ASSET_DEST = path.join(CREATIVE_PITCH_PUBLIC_DIR, "assets");
const CREATIVE_PITCH_STORY_SOURCE = path.join(ROOT, "creative-pitch", "story.json");
const CREATIVE_PITCH_STORY_DEST = path.join(CREATIVE_PITCH_PUBLIC_DIR, "story.json");
const CREATIVE_PITCH_PIPELINE_CONFIG = path.join(ROOT, "creative-pitch", "pipeline", "config.json");
const PHOTOS_SOURCE = path.join(ROOT, "photos");
const PHOTOS_DEST = path.join(RUNTIME_ROOT, "photos");
const CONTENT_MANIFEST_DEST = path.join(ROOT, "content", "manifest.json");
const FRAME_FILE_RE = /^frame_(\d{4})\.webp$/i;
const LEGACY_PUBLIC_PATHS = [
  path.join(ROOT, "public", "content"),
  path.join(ROOT, "public", "creative-pitch"),
  path.join(ROOT, "public", "photos")
];
const DEFAULT_CREATIVE_PITCH_CONFIG = {
  timing: {
    scene_padding_start: 0.05,
    scene_padding_end: 0.04,
    base_frames_per_text: 7,
    characters_per_frame: 1.5,
    min_frames_per_text: 14,
    max_frames_per_text: 96,
    overlap_frames: 10
  },
  defaults: {
    frame_count: 24
  },
  scene_overrides: {}
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCreativePitchConfig(rawConfig) {
  const config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const timing = config.timing && typeof config.timing === "object" ? config.timing : {};
  const defaults = config.defaults && typeof config.defaults === "object" ? config.defaults : {};
  const sceneOverrides =
    config.scene_overrides && typeof config.scene_overrides === "object"
      ? config.scene_overrides
      : {};

  return {
    timing: {
      scene_padding_start: clamp(
        asFiniteNumber(
          timing.scene_padding_start,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.scene_padding_start
        ),
        0,
        0.45
      ),
      scene_padding_end: clamp(
        asFiniteNumber(
          timing.scene_padding_end,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.scene_padding_end
        ),
        0,
        0.45
      ),
      base_frames_per_text: Math.max(
        1,
        asFiniteNumber(
          timing.base_frames_per_text,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.base_frames_per_text
        )
      ),
      characters_per_frame: Math.max(
        0.1,
        asFiniteNumber(
          timing.characters_per_frame,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.characters_per_frame
        )
      ),
      min_frames_per_text: Math.max(
        2,
        asFiniteNumber(
          timing.min_frames_per_text,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.min_frames_per_text
        )
      ),
      max_frames_per_text: Math.max(
        3,
        asFiniteNumber(
          timing.max_frames_per_text,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.max_frames_per_text
        )
      ),
      overlap_frames: Math.max(
        0,
        asFiniteNumber(timing.overlap_frames, DEFAULT_CREATIVE_PITCH_CONFIG.timing.overlap_frames)
      )
    },
    defaults: {
      frame_count: Math.max(
        2,
        Math.round(
          asFiniteNumber(defaults.frame_count, DEFAULT_CREATIVE_PITCH_CONFIG.defaults.frame_count)
        )
      )
    },
    scene_overrides: sceneOverrides
  };
}

async function loadCreativePitchPipelineConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(CREATIVE_PITCH_PIPELINE_CONFIG, "utf-8"));
    return normalizeCreativePitchConfig(raw);
  } catch {
    return normalizeCreativePitchConfig(DEFAULT_CREATIVE_PITCH_CONFIG);
  }
}

function resolveSequenceDirectoryFromPattern(srcPattern) {
  if (typeof srcPattern !== "string" || !srcPattern.startsWith("/assets/")) {
    return null;
  }
  const normalized = srcPattern
    .replace(/^\/assets\//, "")
    .replace(/\/frame_%04d\.webp$/i, "");
  if (!normalized || normalized === srcPattern) {
    return null;
  }
  return path.join(CREATIVE_PITCH_ASSET_SOURCE, normalized);
}

async function countSceneFramesFromAssets(srcPattern) {
  const sequenceDir = resolveSequenceDirectoryFromPattern(srcPattern);
  if (!sequenceDir) {
    return null;
  }

  try {
    const entries = await fs.readdir(sequenceDir, { withFileTypes: true });
    const frameNumbers = entries
      .filter((entry) => entry.isFile() && FRAME_FILE_RE.test(entry.name))
      .map((entry) => Number(FRAME_FILE_RE.exec(entry.name)?.[1] ?? NaN))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (!frameNumbers.length) {
      return null;
    }
    return frameNumbers.length;
  } catch {
    return null;
  }
}

function estimateTextDurationFrames(textContent, timingConfig) {
  const normalizedText = String(textContent ?? "").replace(/\s+/g, " ").trim();
  const charCount = normalizedText.length;
  const framesByLength =
    timingConfig.base_frames_per_text + charCount / timingConfig.characters_per_frame;
  const clampedFrames = clamp(
    framesByLength,
    timingConfig.min_frames_per_text,
    Math.max(timingConfig.min_frames_per_text, timingConfig.max_frames_per_text)
  );
  return Math.max(2, Math.round(clampedFrames));
}

function computeTextWindows(texts, frameCount, timingConfig) {
  const textList = Array.isArray(texts) ? texts : [];
  if (!textList.length) {
    return [];
  }

  const totalFrames = Math.max(2, Math.round(frameCount));
  const progressDenominator = Math.max(1, totalFrames - 1);
  const toProgress = (frames) => frames / progressDenominator;

  const scenePaddingStart = timingConfig.scene_padding_start;
  const scenePaddingEnd = timingConfig.scene_padding_end;
  const availableSpan = Math.max(0.1, 1 - scenePaddingStart - scenePaddingEnd);

  const overlapFrames = Math.max(0, Math.round(timingConfig.overlap_frames));
  const rawDurations = textList.map((text) =>
    toProgress(estimateTextDurationFrames(text?.content, timingConfig))
  );
  const rawOverlap = toProgress(overlapFrames);
  const rawEffectiveSpan =
    rawDurations.reduce((sum, value) => sum + value, 0) - rawOverlap * Math.max(0, textList.length - 1);
  const scale = rawEffectiveSpan > availableSpan ? availableSpan / rawEffectiveSpan : 1;
  const durations = rawDurations.map((value) => value * scale);
  const overlap = rawOverlap * scale;

  const windows = [];
  let cursor = scenePaddingStart;

  for (let index = 0; index < textList.length; index += 1) {
    const start = clamp(cursor, 0, 0.98);
    const end = clamp(start + durations[index], start + 0.01, 1 - scenePaddingEnd);
    windows.push({ start, end });
    cursor = Math.max(scenePaddingStart, end - overlap);
  }

  if (windows.length) {
    windows[windows.length - 1] = {
      ...windows[windows.length - 1],
      end: clamp(1 - scenePaddingEnd, windows[windows.length - 1].start + 0.01, 1)
    };
  }

  return windows;
}

async function resolveSceneFrameCount(scene, config) {
  const sceneOverride = config.scene_overrides?.[scene?.id];
  const overrideFrameCount = Number(sceneOverride?.frame_count);
  if (Number.isFinite(overrideFrameCount) && overrideFrameCount >= 2) {
    return Math.round(overrideFrameCount);
  }

  const assetFrameCount = await countSceneFramesFromAssets(scene?.media?.srcPattern);
  if (Number.isFinite(assetFrameCount) && assetFrameCount >= 2) {
    return Math.round(assetFrameCount);
  }

  const existingFrameCount = Number(scene?.media?.frameCount);
  if (Number.isFinite(existingFrameCount) && existingFrameCount >= 2) {
    return Math.round(existingFrameCount);
  }

  return config.defaults.frame_count;
}

async function buildCreativePitchRuntimeStory(storyPayload, config) {
  const scenes = Array.isArray(storyPayload?.scenes) ? storyPayload.scenes : [];

  const runtimeScenes = await Promise.all(
    scenes.map(async (scene) => {
      const frameCount = await resolveSceneFrameCount(scene, config);
      const texts = Array.isArray(scene?.texts) ? scene.texts : [];
      const textWindows = computeTextWindows(texts, frameCount, config.timing);
      return {
        ...scene,
        media: scene?.media
          ? {
              ...scene.media,
              frameCount
            }
          : null,
        texts: texts.map((text, index) => ({
          ...text,
          start: textWindows[index]?.start ?? 0,
          end: textWindows[index]?.end ?? 1
        }))
      };
    })
  );

  return {
    ...storyPayload,
    scenes: runtimeScenes
  };
}

async function copyDir(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function writeFileIfChanged(filePath, content) {
  try {
    const existing = await fs.readFile(filePath, "utf-8");
    if (existing === content) {
      return false;
    }
  } catch {
    // File missing or unreadable. We will write a fresh copy.
  }

  await fs.writeFile(filePath, content, "utf-8");
  return true;
}

async function listJsonBasenames(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/i, ""))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureContentManifest() {
  const countries = (await listJsonBasenames(path.join(SRC, "countries"))).filter(
    (slug) => slug.toLowerCase() !== "index"
  );
  const themes = (await listJsonBasenames(path.join(SRC, "themes"))).filter(
    (slug) => slug.toLowerCase() !== "index"
  );
  const charts = (await listJsonBasenames(path.join(SRC, "charts"))).filter(
    (slug) => slug.toLowerCase() !== "index"
  );

  const manifest = {
    countries,
    themes,
    charts
  };

  const didWrite = await writeFileIfChanged(
    CONTENT_MANIFEST_DEST,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  if (didWrite) {
    console.log(`Content manifest updated: ${path.relative(ROOT, CONTENT_MANIFEST_DEST)}`);
  }
}

async function ensureCreativePitchAssets() {
  try {
    await fs.access(CREATIVE_PITCH_ASSET_SOURCE);
  } catch {
    console.warn(
      `Creative pitch assets were not found at ${path.relative(ROOT, CREATIVE_PITCH_ASSET_SOURCE)}`
    );
    return;
  }

  await fs.mkdir(CREATIVE_PITCH_PUBLIC_DIR, { recursive: true });

  await ensureLinkedDirectory(CREATIVE_PITCH_ASSET_SOURCE, CREATIVE_PITCH_ASSET_DEST, "Creative pitch assets");
}

async function ensureCreativePitchStory() {
  let storyPayload;
  try {
    storyPayload = JSON.parse(await fs.readFile(CREATIVE_PITCH_STORY_SOURCE, "utf-8"));
  } catch {
    console.warn(
      `Creative pitch story was not found at ${path.relative(ROOT, CREATIVE_PITCH_STORY_SOURCE)}`
    );
    return;
  }

  const config = await loadCreativePitchPipelineConfig();
  const runtimeStory = await buildCreativePitchRuntimeStory(storyPayload, config);
  await fs.mkdir(CREATIVE_PITCH_PUBLIC_DIR, { recursive: true });
  const didWrite = await writeFileIfChanged(
    CREATIVE_PITCH_STORY_DEST,
    `${JSON.stringify(runtimeStory, null, 2)}\n`
  );
  if (didWrite) {
    console.log(
      `Creative pitch runtime story generated: ${path.relative(ROOT, CREATIVE_PITCH_STORY_DEST)}`
    );
  }
}

async function ensureLinkedDirectory(sourcePath, destinationPath, label) {
  const destinationDir = path.dirname(destinationPath);
  await fs.mkdir(destinationDir, { recursive: true });

  let shouldCreateLink = true;
  try {
    const stats = await fs.lstat(destinationPath);
    if (stats.isSymbolicLink()) {
      const linkTarget = await fs.readlink(destinationPath);
      const resolvedLinkTarget = path.resolve(path.dirname(destinationPath), linkTarget);
      const resolvedSource = path.resolve(sourcePath);
      if (resolvedLinkTarget === resolvedSource) {
        shouldCreateLink = false;
      } else {
        await fs.rm(destinationPath, { recursive: true, force: true });
      }
    } else {
      await fs.rm(destinationPath, { recursive: true, force: true });
    }
  } catch {
    shouldCreateLink = true;
  }

  if (shouldCreateLink) {
    try {
      await fs.symlink(sourcePath, destinationPath, "dir");
    } catch (error) {
      console.warn(
        `Could not create symlink for ${label.toLowerCase()} (${error.message}). Falling back to directory copy.`
      );
      await copyDir(sourcePath, destinationPath);
    }
  }

  console.log(
    `${label} linked: ${path.relative(ROOT, destinationPath)} -> ${path.relative(
      ROOT,
      sourcePath
    )}`
  );
}

async function ensurePhotosAssets() {
  try {
    await fs.access(PHOTOS_SOURCE);
  } catch {
    console.warn(`Photos source was not found at ${path.relative(ROOT, PHOTOS_SOURCE)}`);
    return;
  }
  await ensureLinkedDirectory(PHOTOS_SOURCE, PHOTOS_DEST, "Photos");
}

async function main() {
  await ensureContentManifest();
  await fs.mkdir(RUNTIME_ROOT, { recursive: true });
  await Promise.all(LEGACY_PUBLIC_PATHS.map((target) => fs.rm(target, { recursive: true, force: true })));
  await fs.rm(DEST, { recursive: true, force: true });
  await copyDir(SRC, DEST);
  await ensureCreativePitchAssets();
  await ensureCreativePitchStory();
  await ensurePhotosAssets();
  console.log(`Synced content directory to ${path.relative(ROOT, DEST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
