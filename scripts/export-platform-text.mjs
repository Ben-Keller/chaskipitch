import fs from "fs/promises";
import path from "path";
import { parse } from "@babel/parser";

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, "tmp", "platform-text-edits.json");
const outputPath = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : DEFAULT_OUTPUT;

const CODE_ROOTS = [path.join(ROOT, "src")];
const JSON_ROOTS = [path.join(ROOT, "data", "content")];
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function toPosix(filePath) {
  return String(filePath).split(path.sep).join("/");
}

function pathLabel(segments) {
  return segments
    .map((segment, index) =>
      typeof segment === "number"
        ? `[${segment}]`
        : index === 0
          ? String(segment)
          : `.${String(segment)}`
    )
    .join("");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHumanTextCandidate(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  const hasSpace = /\s/.test(text);
  const hasSentencePunctuation = /[.,:;!?'"()]/.test(text);
  const hasUppercase = /[A-Z]/.test(text);
  if (!(hasSpace || hasSentencePunctuation || hasUppercase)) {
    return false;
  }
  if (/^https?:\/\//i.test(text)) return false;
  if (/^[./A-Za-z0-9_-]+$/.test(text) && (text.includes("/") || text.includes("."))) {
    return false;
  }
  if (/^[a-z0-9][a-z0-9_-]*$/.test(text)) {
    return false;
  }
  if (/^[A-Z0-9_-]{2,10}$/.test(text)) {
    return false;
  }
  return true;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootPath, predicate) {
  const found = [];
  if (!(await pathExists(rootPath))) {
    return found;
  }

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
        continue;
      }
      if (entry.isFile() && predicate(nextPath)) {
        found.push(nextPath);
      }
    }
  }

  await walk(rootPath);
  found.sort((left, right) => left.localeCompare(right));
  return found;
}

function nextIdFactory() {
  let count = 0;
  return (prefix) => {
    count += 1;
    return `${prefix}_${String(count).padStart(6, "0")}`;
  };
}

function extractJsonEntries(filePath, relativePath, payload, nextId) {
  const entries = [];

  function visit(value, jsonPath) {
    if (typeof value === "string") {
      if (!isHumanTextCandidate(value)) {
        return;
      }
      entries.push({
        id: nextId("TXT"),
        source_type: "json",
        file: toPosix(relativePath),
        json_path: jsonPath,
        json_path_label: pathLabel(jsonPath),
        text: value,
        new_text: value
      });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...jsonPath, index]);
      });
      return;
    }

    if (isObject(value)) {
      Object.entries(value).forEach(([key, child]) => {
        visit(child, [...jsonPath, key]);
      });
    }
  }

  visit(payload, []);
  return entries;
}

function shouldSkipStringLiteral(parent, node) {
  if (!parent) {
    return false;
  }
  if ((parent.type === "ImportDeclaration" || parent.type === "ExportAllDeclaration" || parent.type === "ExportNamedDeclaration") && parent.source === node) {
    return true;
  }
  if (parent.type === "ObjectProperty" && parent.key === node && !parent.computed) {
    return true;
  }
  if (parent.type === "TSLiteralType") {
    return true;
  }
  return false;
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

function extractCodeEntries(code, filePath, relativePath, nextId) {
  const ast = parse(code, {
    sourceType: "module",
    allowImportExportEverywhere: true,
    errorRecovery: true,
    plugins: ["jsx", "typescript", "importAttributes"]
  });
  const entries = [];

  function addCodeEntry(kind, node, text, extras = {}) {
    if (!isHumanTextCandidate(text)) {
      return;
    }
    entries.push({
      id: nextId("TXT"),
      source_type: "code",
      kind,
      file: toPosix(relativePath),
      locator: {
        start: Number(node.start),
        end: Number(node.end),
        line: Number(node.loc?.start?.line ?? 1),
        column: Number(node.loc?.start?.column ?? 0) + 1
      },
      source_text: code.slice(node.start, node.end),
      text,
      new_text: text,
      ...extras
    });
  }

  function visit(node, parent = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "StringLiteral" && !shouldSkipStringLiteral(parent, node)) {
      addCodeEntry("string_literal", node, node.value);
    } else if (
      node.type === "TemplateLiteral" &&
      node.expressions?.length === 0 &&
      node.quasis?.length === 1
    ) {
      addCodeEntry("template_literal", node, node.quasis[0].value?.cooked ?? "");
    } else if (node.type === "JSXText") {
      const raw = node.value ?? "";
      const trimmed = raw.trim();
      if (trimmed) {
        const leadingWhitespace = raw.match(/^\s*/)?.[0] ?? "";
        const trailingWhitespace = raw.match(/\s*$/)?.[0] ?? "";
        addCodeEntry("jsx_text", node, trimmed, {
          leading_whitespace: leadingWhitespace,
          trailing_whitespace: trailingWhitespace
        });
      }
    }

    for (const value of Object.values(node)) {
      if (!value) continue;
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (child && typeof child.type === "string") {
            visit(child, node);
          }
        });
      } else if (value && typeof value.type === "string") {
        visit(value, node);
      }
    }
  }

  visit(ast.program, null);
  return entries;
}

async function main() {
  const nextId = nextIdFactory();
  const entries = [];

  for (const rootPath of JSON_ROOTS) {
    const files = await collectFiles(rootPath, (filePath) => path.extname(filePath).toLowerCase() === ".json");
    for (const filePath of files) {
      const relativePath = path.relative(ROOT, filePath);
      const raw = await fs.readFile(filePath, "utf8");
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        continue;
      }
      entries.push(...extractJsonEntries(filePath, relativePath, payload, nextId));
    }
  }

  for (const rootPath of CODE_ROOTS) {
    const files = await collectFiles(rootPath, (filePath) =>
      CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    );
    for (const filePath of files) {
      const relativePath = path.relative(ROOT, filePath);
      const code = await fs.readFile(filePath, "utf8");
      entries.push(...extractCodeEntries(code, filePath, relativePath, nextId));
    }
  }

  entries.sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }
    const leftStart = left.locator?.start ?? -1;
    const rightStart = right.locator?.start ?? -1;
    return leftStart - rightStart;
  });

  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      format_version: 1,
      entry_count: entries.length,
      instructions:
        "Edit only `new_text` values. Keep ids and locator/path fields unchanged. Then run `npm run text:apply` to propagate edits."
    },
    entries
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Exported ${entries.length} text entries to ${toPosix(path.relative(ROOT, outputPath))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
