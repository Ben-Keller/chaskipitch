import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const ASSET_ROOT = path.join(ROOT, "creative-pitch", "assets");
const FRAME_PNG_RE = /^frame_\d{4}\.png$/i;
const FRAME_NON_FINAL_RE = /^frame_\d{4}\.(png|jpg|jpeg|tif|tiff|bmp|avif)$/i;
const REMOVE_UPSCALED_PNG = process.env.REMOVE_UPSCALED_PNG !== "false";
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY ?? 82);
const PIPELINE_OUTPUT_DIR = path.join(ROOT, "creative-pitch", "pipeline", "output");
const RUN_BACKUP_DIRS = [
  path.join(ROOT, "creative-pitch", "pipeline", "runs"),
  path.join(ROOT, "creative-pitch", "pipeline", "run_backups")
];
const COSTLY_PROVIDER_RE = /(^|\/)(openai|runway)(\/|$)/i;

function isFinitePositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(baseDir) {
  const files = [];
  const stack = [baseDir];

  while (stack.length) {
    const currentDir = stack.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  return files;
}

async function pruneEmptyDirectories(baseDir) {
  if (!(await fileExists(baseDir))) {
    return;
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const absolute = path.join(baseDir, entry.name);
    await pruneEmptyDirectories(absolute);
  }

  const afterEntries = await fs.readdir(baseDir);
  if (!afterEntries.length) {
    await fs.rmdir(baseDir);
  }
}

async function listUpscaledFramePngs(baseDir) {
  const stack = [baseDir];
  const found = [];

  while (stack.length) {
    const currentDir = stack.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (entry.isFile() && FRAME_PNG_RE.test(entry.name)) {
        found.push(absolute);
      }
    }
  }

  found.sort((a, b) => a.localeCompare(b));
  return found;
}

async function resolveEncoder() {
  const candidates = [
    {
      name: "cwebp",
      async convert(inputPath, outputPath, quality) {
        await execFileAsync("cwebp", [
          "-quiet",
          "-q",
          String(quality),
          inputPath,
          "-o",
          outputPath
        ]);
      }
    },
    {
      name: "ffmpeg",
      async convert(inputPath, outputPath, quality) {
        await execFileAsync("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inputPath,
          "-c:v",
          "libwebp",
          "-q:v",
          String(quality),
          "-compression_level",
          "6",
          "-preset",
          "picture",
          "-an",
          outputPath
        ]);
      }
    },
    {
      name: "sips",
      async convert(inputPath, outputPath) {
        await execFileAsync("sips", [
          "-s",
          "format",
          "webp",
          inputPath,
          "--out",
          outputPath
        ]);
      }
    }
  ];

  for (const candidate of candidates) {
    try {
      await execFileAsync("which", [candidate.name]);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function needsRebuild(sourcePath, targetPath) {
  if (!(await fileExists(targetPath))) {
    return true;
  }

  const [sourceStats, targetStats] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(targetPath)
  ]);

  return sourceStats.mtimeMs > targetStats.mtimeMs;
}

async function prunePipelineOutput() {
  if (!(await fileExists(PIPELINE_OUTPUT_DIR))) {
    return false;
  }
  await fs.rm(PIPELINE_OUTPUT_DIR, { recursive: true, force: true });
  return true;
}

async function pruneRunBackups() {
  let removedFiles = 0;

  for (const backupDir of RUN_BACKUP_DIRS) {
    if (!(await fileExists(backupDir))) {
      continue;
    }

    const files = await listFilesRecursive(backupDir);
    for (const filePath of files) {
      const relative = path.relative(backupDir, filePath).replaceAll(path.sep, "/");
      if (COSTLY_PROVIDER_RE.test(`/${relative}`)) {
        continue;
      }
      await fs.rm(filePath, { force: true });
      removedFiles += 1;
    }

    await pruneEmptyDirectories(backupDir).catch(() => {
      // If root is non-empty or already removed, continue.
    });
  }

  return removedFiles;
}

async function pruneNonFinalAssetArtifacts() {
  if (!(await fileExists(ASSET_ROOT))) {
    return 0;
  }

  const files = await listFilesRecursive(ASSET_ROOT);
  let removed = 0;

  for (const filePath of files) {
    const name = path.basename(filePath);

    if (name === ".DS_Store") {
      await fs.rm(filePath, { force: true });
      removed += 1;
      continue;
    }

    if (FRAME_NON_FINAL_RE.test(name)) {
      await fs.rm(filePath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

async function main() {
  if (!(await fileExists(ASSET_ROOT))) {
    console.log("Creative pitch assets directory does not exist, skipping sequence conversion.");
    return;
  }

  if (!isFinitePositiveNumber(WEBP_QUALITY)) {
    throw new Error(`Invalid WEBP_QUALITY '${process.env.WEBP_QUALITY}'. Use a positive number.`);
  }

  const framePngs = await listUpscaledFramePngs(ASSET_ROOT);
  if (!framePngs.length) {
    const removedAssetArtifacts = await pruneNonFinalAssetArtifacts();
    const removedRunBackupFiles = await pruneRunBackups();
    const removedPipelineOutput = await prunePipelineOutput();

    console.log("No upscaled PNG sequence frames found. Creative sequence conversion skipped.");
    console.log(`- Non-final asset artifacts removed: ${removedAssetArtifacts}`);
    console.log(`- Non-provider run backup files removed: ${removedRunBackupFiles}`);
    console.log(`- Pipeline output cleared: ${removedPipelineOutput ? "yes" : "no"}`);
    return;
  }

  const encoder = await resolveEncoder();
  if (!encoder) {
    throw new Error(
      "No WebP encoder found. Install one of: cwebp, ffmpeg, or sips."
    );
  }

  let convertedCount = 0;
  let removedCount = 0;
  let inputBytes = 0;
  let outputBytes = 0;

  for (const pngPath of framePngs) {
    const webpPath = pngPath.replace(/\.png$/i, ".webp");
    const shouldConvert = await needsRebuild(pngPath, webpPath);

    if (shouldConvert) {
      await encoder.convert(pngPath, webpPath, WEBP_QUALITY);
      convertedCount += 1;
    }

    const [pngStats, webpStats] = await Promise.all([
      fs.stat(pngPath),
      fs.stat(webpPath)
    ]);
    inputBytes += pngStats.size;
    outputBytes += webpStats.size;

    if (REMOVE_UPSCALED_PNG) {
      await fs.rm(pngPath, { force: true });
      removedCount += 1;
    }
  }

  const inputMb = (inputBytes / (1024 * 1024)).toFixed(2);
  const outputMb = (outputBytes / (1024 * 1024)).toFixed(2);
  const ratio = inputBytes > 0 ? ((outputBytes / inputBytes) * 100).toFixed(1) : "0.0";
  const removedAssetArtifacts = await pruneNonFinalAssetArtifacts();
  const removedRunBackupFiles = await pruneRunBackups();
  const removedPipelineOutput = await prunePipelineOutput();

  console.log(`Creative sequence conversion complete with encoder: ${encoder.name}`);
  console.log(`- Frames discovered: ${framePngs.length}`);
  console.log(`- Frames converted: ${convertedCount}`);
  console.log(`- PNG removed: ${removedCount}`);
  console.log(`- Total input PNG size: ${inputMb} MB`);
  console.log(`- Total output WebP size: ${outputMb} MB (${ratio}% of input)`);
  console.log(`- Non-final asset artifacts removed: ${removedAssetArtifacts}`);
  console.log(`- Non-provider run backup files removed: ${removedRunBackupFiles}`);
  console.log(`- Pipeline output cleared: ${removedPipelineOutput ? "yes" : "no"}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
