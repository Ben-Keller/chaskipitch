import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "content");
const DEST = path.join(ROOT, "public", "content");
const CREATIVE_PITCH_STORY_SOURCE = path.join(ROOT, "creative-pitch", "story.json");
const CREATIVE_PITCH_STORY_DEST = path.join(ROOT, "content", "creative-pitch-story.json");
const CREATIVE_PITCH_ASSET_SOURCE = path.join(ROOT, "creative-pitch", "assets");
const CREATIVE_PITCH_PUBLIC_DIR = path.join(ROOT, "public", "creative-pitch");
const CREATIVE_PITCH_ASSET_DEST = path.join(CREATIVE_PITCH_PUBLIC_DIR, "assets");
const PHOTOS_SOURCE = path.join(ROOT, "photos");
const PHOTOS_DEST = path.join(ROOT, "public", "photos");

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

async function ensureCreativePitchStory() {
  try {
    await fs.access(CREATIVE_PITCH_STORY_SOURCE);
  } catch {
    console.warn(
      `Creative pitch story was not found at ${path.relative(ROOT, CREATIVE_PITCH_STORY_SOURCE)}`
    );
    return;
  }

  await fs.mkdir(path.dirname(CREATIVE_PITCH_STORY_DEST), { recursive: true });
  await fs.copyFile(CREATIVE_PITCH_STORY_SOURCE, CREATIVE_PITCH_STORY_DEST);
  console.log(
    `Creative pitch story synced: ${path.relative(ROOT, CREATIVE_PITCH_STORY_DEST)} <- ${path.relative(
      ROOT,
      CREATIVE_PITCH_STORY_SOURCE
    )}`
  );
}

async function main() {
  await ensureCreativePitchStory();
  await fs.rm(DEST, { recursive: true, force: true });
  await copyDir(SRC, DEST);
  await ensureCreativePitchAssets();
  await ensurePhotosAssets();
  console.log(`Synced content directory to ${path.relative(ROOT, DEST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
