import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const TARGETS = ["content", "data-templates"];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const matches = [];

  for (const target of TARGETS) {
    const abs = path.join(ROOT, target);
    const files = await walk(abs);

    for (const file of files) {
      const rel = path.relative(ROOT, file);
      const text = await fs.readFile(file, "utf-8");
      if (text.includes("PLACEHOLDER")) {
        const lines = text.split("\n");
        lines.forEach((line, index) => {
          if (line.includes("PLACEHOLDER")) {
            matches.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }

  console.log(`Placeholder matches: ${matches.length}`);
  matches.slice(0, 120).forEach((item) => console.log(item));

  if (matches.length > 120) {
    console.log(`... ${matches.length - 120} additional matches omitted`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
