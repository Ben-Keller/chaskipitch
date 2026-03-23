import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const DEFAULT_LIMIT_MB = 5;

function parseLimitArg() {
  const raw = process.argv[2];
  if (!raw) {
    return DEFAULT_LIMIT_MB;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid limit '${raw}'. Expected a positive number in MB.`);
  }
  return value;
}

async function gitTrackedFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: ROOT });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function collectFileSizes(paths) {
  const rows = await Promise.all(
    paths.map(async (filePath) => {
      const absolute = path.join(ROOT, filePath);
      try {
        const stats = await fs.stat(absolute);
        return { filePath, bytes: stats.size };
      } catch {
        return null;
      }
    })
  );
  return rows.filter(Boolean);
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function aggregateTopLevel(sizedFiles) {
  const sizeByTopLevel = new Map();
  for (const item of sizedFiles) {
    const top = item.filePath.split("/")[0];
    sizeByTopLevel.set(top, (sizeByTopLevel.get(top) ?? 0) + item.bytes);
  }
  return [...sizeByTopLevel.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
}

async function main() {
  const limitMb = parseLimitArg();
  const limitBytes = limitMb * 1024 * 1024;

  const trackedFiles = await gitTrackedFiles();
  const sizedFiles = await collectFileSizes(trackedFiles);

  const largeFiles = sizedFiles
    .filter((item) => item.bytes >= limitBytes)
    .sort((a, b) => b.bytes - a.bytes);

  const topLevel = aggregateTopLevel(sizedFiles);

  console.log(`Tracked files: ${sizedFiles.length}`);
  console.log(`Top-level tracked size summary:`);
  topLevel.slice(0, 12).forEach((item) => {
    console.log(`  - ${item.name}: ${formatMb(item.bytes)}`);
  });

  console.log(`\nTracked files >= ${limitMb} MB: ${largeFiles.length}`);
  largeFiles.slice(0, 40).forEach((item) => {
    console.log(`  - ${item.filePath}: ${formatMb(item.bytes)}`);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
