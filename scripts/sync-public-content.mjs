import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CONTENT_SOURCE = path.join(ROOT, "data", "content");
const STATIC_SOURCE_ROOT = path.join(ROOT, "assets", "static");
const RUNTIME_ROOT = path.join(ROOT, "public", "runtime");
const DEST = path.join(RUNTIME_ROOT, "content");
const CREATIVE_PITCH_ASSET_SOURCE = path.join(ROOT, "creative-pitch", "assets");
const CREATIVE_PITCH_PUBLIC_DIR = path.join(RUNTIME_ROOT, "creative-pitch");
const CREATIVE_PITCH_ASSET_DEST = path.join(CREATIVE_PITCH_PUBLIC_DIR, "assets");
const CREATIVE_PITCH_STORY_SOURCE = path.join(ROOT, "creative-pitch", "story.json");
const CREATIVE_PITCH_STORY_DEST = path.join(CREATIVE_PITCH_PUBLIC_DIR, "story.json");
const CREATIVE_PITCH_PIPELINE_CONFIG = path.join(ROOT, "creative-pitch", "pipeline", "config.json");
const PHOTOS_SOURCE = path.join(ROOT, "assets", "photos");
const PHOTOS_DEST = path.join(RUNTIME_ROOT, "photos");
const CONTENT_MANIFEST_DEST = path.join(ROOT, "data", "content", "manifest.json");
const FRAME_FILE_RE = /^frame_(\d{4})\.webp$/i;
const LEGACY_PUBLIC_PATHS = [
  path.join(ROOT, "public", "content"),
  path.join(ROOT, "public", "creative-pitch"),
  path.join(ROOT, "public", "photos")
];
const STATIC_PUBLIC_LINKS = [
  {
    source: path.join(STATIC_SOURCE_ROOT, "films"),
    destination: path.join(ROOT, "public", "films"),
    label: "Film static assets"
  },
  {
    source: path.join(STATIC_SOURCE_ROOT, "home"),
    destination: path.join(ROOT, "public", "home"),
    label: "Home static assets"
  },
  {
    source: path.join(STATIC_SOURCE_ROOT, "icons"),
    destination: path.join(ROOT, "public", "icons"),
    label: "Icon static assets"
  },
  {
    source: path.join(STATIC_SOURCE_ROOT, "media"),
    destination: path.join(ROOT, "public", "media"),
    label: "Editorial media assets"
  },
  {
    source: path.join(STATIC_SOURCE_ROOT, "report"),
    destination: path.join(ROOT, "public", "report"),
    label: "Report assets"
  }
];
const DEFAULT_CREATIVE_PITCH_CONFIG = {
  timing: {
    base_timing_seconds: 0.42,
    seconds_per_word: 0.045,
    bonus_first_text_seconds: 0.275,
    bonus_third_text_seconds: 1.6,
    first_text_pre_fade_extra_from_second_ratio: 0.7,
    second_text_pre_fade_extra_from_third_ratio: 0.5,
    scene_padding_start_seconds: 0.22,
    scene_padding_end_seconds: 0.2,
    text_fade_seconds: 0.2,
    scroll_seconds_per_1000px: 0.662,
    drag_seconds_per_1000px: 1.241,
    keyboard_step_seconds: 0.455
  },
  defaults: {
    frame_count: 24,
    playback_fps: 24,
    min_scene_seconds: 0.4,
    autoplay_speed_multiplier: 0.414
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
      base_timing_seconds: clamp(
        asFiniteNumber(
          timing.base_timing_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.base_timing_seconds
        ),
        0.05,
        4
      ),
      seconds_per_word: clamp(
        asFiniteNumber(
          timing.seconds_per_word,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.seconds_per_word
        ),
        0.005,
        0.25
      ),
      bonus_first_text_seconds: clamp(
        asFiniteNumber(
          timing.bonus_first_text_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.bonus_first_text_seconds
        ),
        0,
        5
      ),
      bonus_third_text_seconds: clamp(
        asFiniteNumber(
          timing.bonus_third_text_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.bonus_third_text_seconds
        ),
        0,
        5
      ),
      first_text_pre_fade_extra_from_second_ratio: clamp(
        asFiniteNumber(
          timing.first_text_pre_fade_extra_from_second_ratio,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.first_text_pre_fade_extra_from_second_ratio
        ),
        0,
        2
      ),
      second_text_pre_fade_extra_from_third_ratio: clamp(
        asFiniteNumber(
          timing.second_text_pre_fade_extra_from_third_ratio,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.second_text_pre_fade_extra_from_third_ratio
        ),
        0,
        2
      ),
      scene_padding_start_seconds: clamp(
        asFiniteNumber(
          timing.scene_padding_start_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.scene_padding_start_seconds
        ),
        0,
        2
      ),
      scene_padding_end_seconds: clamp(
        asFiniteNumber(
          timing.scene_padding_end_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.scene_padding_end_seconds
        ),
        0,
        2
      ),
      text_fade_seconds: clamp(
        asFiniteNumber(
          timing.text_fade_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.text_fade_seconds
        ),
        0.05,
        2
      ),
      scroll_seconds_per_1000px: Math.max(
        0.2,
        asFiniteNumber(
          timing.scroll_seconds_per_1000px,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.scroll_seconds_per_1000px
        )
      ),
      drag_seconds_per_1000px: Math.max(
        0.2,
        asFiniteNumber(
          timing.drag_seconds_per_1000px,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.drag_seconds_per_1000px
        )
      ),
      keyboard_step_seconds: Math.max(
        0.05,
        asFiniteNumber(
          timing.keyboard_step_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.timing.keyboard_step_seconds
        )
      )
    },
    defaults: {
      frame_count: Math.max(
        2,
        Math.round(
          asFiniteNumber(defaults.frame_count, DEFAULT_CREATIVE_PITCH_CONFIG.defaults.frame_count)
        )
      ),
      playback_fps: Math.max(
        1,
        asFiniteNumber(
          defaults.playback_fps,
          DEFAULT_CREATIVE_PITCH_CONFIG.defaults.playback_fps
        )
      ),
      min_scene_seconds: Math.max(
        0.4,
        asFiniteNumber(
          defaults.min_scene_seconds,
          DEFAULT_CREATIVE_PITCH_CONFIG.defaults.min_scene_seconds
        )
      ),
      autoplay_speed_multiplier: Math.max(
        0.1,
        asFiniteNumber(
          defaults.autoplay_speed_multiplier,
          DEFAULT_CREATIVE_PITCH_CONFIG.defaults.autoplay_speed_multiplier
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

function countWords(textContent) {
  const normalizedText = String(textContent ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return 0;
  }
  return normalizedText.split(" ").length;
}

function computeTextDurationsSeconds(texts, timingConfig) {
  const textList = Array.isArray(texts) ? texts : [];
  return textList.map((text, index) => {
    const words = countWords(text?.content);
    const bonus =
      index === 0
        ? timingConfig.bonus_first_text_seconds
        : index === 2
          ? timingConfig.bonus_third_text_seconds
          : 0;
    return Math.max(
      0.01,
      timingConfig.base_timing_seconds + words * timingConfig.seconds_per_word + bonus
    );
  });
}

function computeTextTimelineSeconds(texts, timingConfig) {
  const textList = Array.isArray(texts) ? texts : [];
  if (!textList.length) {
    return {
      durations: [],
      starts: [],
      ends: [],
      requiredTextSpanSeconds: 0
    };
  }

  const durations = computeTextDurationsSeconds(textList, timingConfig);
  const starts = [];
  let cursor = 0;
  for (let index = 0; index < durations.length; index += 1) {
    starts.push(cursor);
    cursor += durations[index];
  }

  const ends = starts.map((startSeconds, index) => startSeconds + durations[index]);
  if (durations.length > 1) {
    ends[0] = Math.max(
      ends[0],
      starts[1] +
        durations[1] * timingConfig.first_text_pre_fade_extra_from_second_ratio
    );
  }
  if (durations.length > 2) {
    ends[1] = Math.max(
      ends[1],
      starts[2] +
        durations[2] * timingConfig.second_text_pre_fade_extra_from_third_ratio
    );
  }

  const requiredTextSpanSeconds = ends.reduce((maxValue, value) => Math.max(maxValue, value), 0);
  return {
    durations,
    starts,
    ends,
    requiredTextSpanSeconds
  };
}

function computeTextWindows(texts, sceneDurationSeconds, timingConfig) {
  const textList = Array.isArray(texts) ? texts : [];
  if (!textList.length) {
    return [];
  }

  const timeline = computeTextTimelineSeconds(textList, timingConfig);
  const sceneDuration = Math.max(0.4, Number(sceneDurationSeconds) || 0.4);
  const sceneStart = timingConfig.scene_padding_start_seconds;
  const sceneEnd = timingConfig.scene_padding_end_seconds;
  const maxEndSeconds = Math.max(sceneStart + 0.01, sceneDuration - sceneEnd);

  return textList.map((_, index) => {
    const startSeconds = clamp(sceneStart + timeline.starts[index], 0, maxEndSeconds - 0.01);
    const endSeconds = clamp(
      sceneStart + timeline.ends[index],
      startSeconds + 0.01,
      maxEndSeconds
    );
    return {
      start: clamp(startSeconds / sceneDuration, 0, 1),
      end: clamp(endSeconds / sceneDuration, 0, 1),
      startSeconds,
      endSeconds
    };
  });
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

function resolveScenePlaybackFps(scene, config) {
  const sceneOverride = config.scene_overrides?.[scene?.id];
  const overrideFps = Number(sceneOverride?.playback_fps);
  if (Number.isFinite(overrideFps) && overrideFps > 0) {
    return overrideFps;
  }

  const mediaFps = Number(scene?.media?.frameRate);
  if (Number.isFinite(mediaFps) && mediaFps > 0) {
    return mediaFps;
  }

  return config.defaults.playback_fps;
}

function resolveSceneDurationSeconds(scene, frameCount, fps, texts, config) {
  const textTimeline = computeTextTimelineSeconds(texts, config.timing);
  const requiredDurationSeconds =
    config.timing.scene_padding_start_seconds +
    textTimeline.requiredTextSpanSeconds +
    config.timing.scene_padding_end_seconds;
  const sceneOverride = config.scene_overrides?.[scene?.id];
  const overrideDuration = Number(sceneOverride?.duration_seconds);
  if (Number.isFinite(overrideDuration) && overrideDuration > 0) {
    return Math.max(0.4, overrideDuration, config.defaults.min_scene_seconds, requiredDurationSeconds);
  }

  const mediaDurationOverride = Number(scene?.media?.durationSeconds);
  if (Number.isFinite(mediaDurationOverride) && mediaDurationOverride > 0) {
    return Math.max(
      0.4,
      mediaDurationOverride,
      config.defaults.min_scene_seconds,
      requiredDurationSeconds
    );
  }

  const mediaDurationSeconds = Math.max(0.4, frameCount / Math.max(1, fps));
  return Math.max(mediaDurationSeconds, config.defaults.min_scene_seconds, requiredDurationSeconds);
}

async function buildCreativePitchRuntimeStory(storyPayload, config) {
  const scenes = Array.isArray(storyPayload?.scenes) ? storyPayload.scenes : [];

  const runtimeScenes = await Promise.all(
    scenes.map(async (scene) => {
      const frameCount = await resolveSceneFrameCount(scene, config);
      const frameRate = resolveScenePlaybackFps(scene, config);
      const texts = Array.isArray(scene?.texts) ? scene.texts : [];
      const durationSeconds = resolveSceneDurationSeconds(
        scene,
        frameCount,
        frameRate,
        texts,
        config
      );
      const textWindows = computeTextWindows(texts, durationSeconds, config.timing);
      return {
        ...scene,
        media: scene?.media
          ? {
              ...scene.media,
              frameCount,
              frameRate: Number(frameRate.toFixed(3)),
              durationSeconds: Number(durationSeconds.toFixed(3))
            }
          : null,
        texts: texts.map((text, index) => ({
          ...text,
          start: textWindows[index]?.start ?? 0,
          end: textWindows[index]?.end ?? 1,
          startSeconds: textWindows[index]?.startSeconds ?? 0,
          endSeconds: textWindows[index]?.endSeconds ?? durationSeconds
        }))
      };
    })
  );

  const totalDurationSeconds = runtimeScenes.reduce((sum, scene) => {
    const duration = Number(scene?.media?.durationSeconds);
    return sum + (Number.isFinite(duration) && duration > 0 ? duration : 0);
  }, 0);

  return {
    ...storyPayload,
    playback: {
      frameRate: Number(config.defaults.playback_fps.toFixed(3)),
      autoplaySpeedMultiplier: Number(config.defaults.autoplay_speed_multiplier.toFixed(3)),
      totalDurationSeconds: Number(Math.max(0, totalDurationSeconds).toFixed(3)),
      scrollSecondsPer1000Px: Number(config.timing.scroll_seconds_per_1000px.toFixed(3)),
      dragSecondsPer1000Px: Number(config.timing.drag_seconds_per_1000px.toFixed(3)),
      keyboardStepSeconds: Number(config.timing.keyboard_step_seconds.toFixed(3)),
      baseTimingSeconds: Number(config.timing.base_timing_seconds.toFixed(3)),
      textFadeSeconds: Number(config.timing.text_fade_seconds.toFixed(3))
    },
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
  let entries = [];
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/i, ""))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureContentManifest() {
  const countries = (await listJsonBasenames(path.join(CONTENT_SOURCE, "countries"))).filter(
    (slug) => slug.toLowerCase() !== "index"
  );
  const themes = (await listJsonBasenames(path.join(CONTENT_SOURCE, "themes"))).filter(
    (slug) => slug.toLowerCase() !== "index"
  );
  const charts = (await listJsonBasenames(path.join(CONTENT_SOURCE, "charts"))).filter(
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

async function ensureStaticPublicAssets() {
  for (const asset of STATIC_PUBLIC_LINKS) {
    try {
      await fs.access(asset.source);
    } catch {
      console.warn(`${asset.label} were not found at ${path.relative(ROOT, asset.source)}`);
      continue;
    }
    await ensureLinkedDirectory(asset.source, asset.destination, asset.label);
  }
}

async function main() {
  await ensureContentManifest();
  await fs.mkdir(path.join(ROOT, "public"), { recursive: true });
  await fs.mkdir(RUNTIME_ROOT, { recursive: true });
  await Promise.all(LEGACY_PUBLIC_PATHS.map((target) => fs.rm(target, { recursive: true, force: true })));
  await fs.rm(DEST, { recursive: true, force: true });
  await copyDir(CONTENT_SOURCE, DEST);
  await ensureStaticPublicAssets();
  await ensureCreativePitchAssets();
  await ensureCreativePitchStory();
  await ensurePhotosAssets();
  console.log(`Synced content directory to ${path.relative(ROOT, DEST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
