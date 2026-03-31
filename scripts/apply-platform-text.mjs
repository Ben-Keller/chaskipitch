import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(ROOT, "tmp", "platform-text-edits.json");
const inputPath = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : DEFAULT_INPUT;

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function quoteLike(sourceLiteral, nextText) {
  const quote = sourceLiteral?.[0];
  if (quote === "'") {
    return `'${String(nextText)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")}'`;
  }
  if (quote === "`") {
    return `\`${String(nextText)
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")}\``;
  }
  return JSON.stringify(String(nextText));
}

function setJsonPath(rootValue, jsonPath, nextText) {
  if (!Array.isArray(jsonPath) || jsonPath.length === 0) {
    return false;
  }

  let current = rootValue;
  for (let index = 0; index < jsonPath.length - 1; index += 1) {
    const segment = jsonPath[index];
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        return false;
      }
      current = current[segment];
    } else {
      if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
        return false;
      }
      current = current[segment];
    }
  }

  const finalSegment = jsonPath[jsonPath.length - 1];
  if (typeof finalSegment === "number") {
    if (!Array.isArray(current) || finalSegment < 0 || finalSegment >= current.length) {
      return false;
    }
    current[finalSegment] = String(nextText);
    return true;
  }

  if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, finalSegment)) {
    return false;
  }
  current[finalSegment] = String(nextText);
  return true;
}

function applyCodeEntry(source, entry) {
  const start = Number(entry?.locator?.start);
  const end = Number(entry?.locator?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > source.length) {
    return { ok: false, nextSource: source, reason: "invalid range" };
  }

  const currentSlice = source.slice(start, end);
  if (typeof entry.source_text === "string" && entry.source_text !== currentSlice) {
    return { ok: false, nextSource: source, reason: "source mismatch" };
  }

  const nextText = String(entry.new_text ?? "");
  let replacement = currentSlice;

  if (entry.kind === "jsx_text") {
    const leading = String(entry.leading_whitespace ?? "");
    const trailing = String(entry.trailing_whitespace ?? "");
    replacement = `${leading}${nextText}${trailing}`;
  } else if (entry.kind === "string_literal" || entry.kind === "template_literal") {
    replacement = quoteLike(currentSlice, nextText);
  } else {
    return { ok: false, nextSource: source, reason: `unsupported kind '${entry.kind}'` };
  }

  return {
    ok: true,
    nextSource: `${source.slice(0, start)}${replacement}${source.slice(end)}`
  };
}

async function main() {
  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const changedEntries = entries.filter((entry) => entry?.new_text !== undefined && entry.new_text !== entry.text);

  if (!changedEntries.length) {
    console.log("No text changes detected in new_text fields.");
    return;
  }

  const entriesByFile = new Map();
  changedEntries.forEach((entry) => {
    const file = String(entry.file || "").trim();
    if (!file) return;
    if (!entriesByFile.has(file)) {
      entriesByFile.set(file, []);
    }
    entriesByFile.get(file).push(entry);
  });

  let jsonChanges = 0;
  let codeChanges = 0;
  const skipped = [];

  for (const [file, fileEntries] of entriesByFile.entries()) {
    const absolutePath = path.resolve(ROOT, file);

    let source;
    try {
      source = await fs.readFile(absolutePath, "utf8");
    } catch {
      skipped.push(`${file}: file missing`);
      continue;
    }

    const jsonEntries = fileEntries.filter((entry) => entry.source_type === "json");
    const codeEntries = fileEntries.filter((entry) => entry.source_type === "code");

    if (jsonEntries.length && !codeEntries.length) {
      let document;
      try {
        document = JSON.parse(source);
      } catch {
        skipped.push(`${file}: invalid JSON`);
        continue;
      }

      let appliedCount = 0;
      jsonEntries.forEach((entry) => {
        const ok = setJsonPath(document, entry.json_path, entry.new_text);
        if (ok) {
          appliedCount += 1;
        } else {
          skipped.push(`${file}#${entry.id}: json path missing`);
        }
      });

      if (appliedCount > 0) {
        await fs.writeFile(absolutePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
        jsonChanges += appliedCount;
      }
      continue;
    }

    if (codeEntries.length) {
      const sorted = [...codeEntries].sort(
        (left, right) => Number(right?.locator?.start ?? 0) - Number(left?.locator?.start ?? 0)
      );

      let nextSource = source;
      let appliedCount = 0;

      sorted.forEach((entry) => {
        const result = applyCodeEntry(nextSource, entry);
        if (result.ok) {
          nextSource = result.nextSource;
          appliedCount += 1;
        } else {
          skipped.push(`${file}#${entry.id}: ${result.reason}`);
        }
      });

      if (appliedCount > 0 && nextSource !== source) {
        await fs.writeFile(absolutePath, nextSource, "utf8");
        codeChanges += appliedCount;
      }
      continue;
    }
  }

  console.log(`Applied text edits: ${jsonChanges} JSON updates, ${codeChanges} code updates.`);
  if (skipped.length) {
    console.log("Skipped entries:");
    skipped.slice(0, 60).forEach((line) => console.log(`- ${line}`));
    if (skipped.length > 60) {
      console.log(`- ... and ${skipped.length - 60} more`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
