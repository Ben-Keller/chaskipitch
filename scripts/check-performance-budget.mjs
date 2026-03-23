import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");

const BUDGETS = {
  maxTotalJsKb: 1400,
  maxTotalCssKb: 260,
  maxChunkKb: 320
};

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(baseDir) {
  if (!(await pathExists(baseDir))) {
    return [];
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const collected = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(baseDir, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(absolute);
      }
      return [absolute];
    })
  );

  return collected.flat();
}

async function fileSizeBytes(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.size;
  } catch {
    return 0;
  }
}

function toKb(bytes) {
  return bytes / 1024;
}

function formatKb(bytes) {
  return `${toKb(bytes).toFixed(1)} KB`;
}

function sortByBytesDescending(items) {
  return [...items].sort((left, right) => right.bytes - left.bytes);
}

async function main() {
  if (!(await pathExists(DIST_DIR))) {
    console.log("No dist build output found. Run `npm run build` before `npm run perf:budget`.");
    process.exit(0);
  }

  const assetFiles = await listFilesRecursive(ASSETS_DIR);
  const jsFiles = assetFiles.filter((filePath) => filePath.endsWith(".js"));
  const cssFiles = assetFiles.filter((filePath) => filePath.endsWith(".css"));

  const jsSummaries = await Promise.all(
    jsFiles.map(async (filePath) => ({
      file: path.relative(DIST_DIR, filePath),
      bytes: await fileSizeBytes(filePath)
    }))
  );

  const cssSummaries = await Promise.all(
    cssFiles.map(async (filePath) => ({
      file: path.relative(DIST_DIR, filePath),
      bytes: await fileSizeBytes(filePath)
    }))
  );

  const totalJsBytes = jsSummaries.reduce((sum, item) => sum + item.bytes, 0);
  const totalCssBytes = cssSummaries.reduce((sum, item) => sum + item.bytes, 0);
  const largestChunk = sortByBytesDescending(jsSummaries)[0] ?? { file: "N/A", bytes: 0 };

  console.log("Performance budget report");
  console.log(`- Total JS bundle: ${formatKb(totalJsBytes)}`);
  console.log(`- Total CSS bundle: ${formatKb(totalCssBytes)}`);
  console.log(`- Largest JS chunk: ${largestChunk.file} (${formatKb(largestChunk.bytes)})`);

  const violations = [];

  if (toKb(totalJsBytes) > BUDGETS.maxTotalJsKb) {
    violations.push(`Total JS bundle ${formatKb(totalJsBytes)} exceeds ${BUDGETS.maxTotalJsKb} KB`);
  }

  if (toKb(totalCssBytes) > BUDGETS.maxTotalCssKb) {
    violations.push(`Total CSS bundle ${formatKb(totalCssBytes)} exceeds ${BUDGETS.maxTotalCssKb} KB`);
  }

  if (toKb(largestChunk.bytes) > BUDGETS.maxChunkKb) {
    violations.push(
      `Largest chunk ${largestChunk.file} (${formatKb(largestChunk.bytes)}) exceeds ${BUDGETS.maxChunkKb} KB`
    );
  }

  if (violations.length) {
    console.log(`- Budget violations: ${violations.length}`);
    violations.forEach((violation) => console.log(`  ERROR: ${violation}`));
    throw new Error("Performance budget check failed.");
  }

  console.log("Performance budget check passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
