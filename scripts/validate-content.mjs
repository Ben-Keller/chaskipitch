import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "data", "content");
const MAX_PAGE = 83;

let z = null;
try {
  const zodModule = await import("zod");
  z = zodModule.z;
} catch {
  console.warn("WARN: zod is not installed; running fallback structural validation only.");
}

function getPages(value) {
  const pages = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (key === "source_page" && typeof child === "number") {
          pages.push(child);
        }
        walk(child);
      }
    }
  };
  walk(value);
  return pages;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf-8");
  return JSON.parse(text);
}

function fallbackCountryCheck(payload) {
  const required = [
    "iso3",
    "name",
    "status",
    "status_tags",
    "status_timeline",
    "project_count",
    "projects",
    "source_refs",
    "geo_ref",
    "confidence"
  ];
  const missing = required.filter((key) => !(key in payload));
  if (missing.length) {
    return { success: false, error: `missing keys: ${missing.join(", ")}` };
  }
  return { success: true, data: payload };
}

function fallbackGlobalCheck(payload) {
  if (!("report" in payload) || !("hero_kpis" in payload)) {
    return { success: false, error: "missing report or hero_kpis" };
  }
  return { success: true, data: payload };
}

function buildZodSchemas() {
  if (!z) {
    return null;
  }

  const countryStatusSchema = z.enum([
    "active",
    "additional_2024",
    "first_time_2024",
    "preparing",
    "under_assessment"
  ]);

  const sourceTypeSchema = z.enum([
    "figure",
    "chapter",
    "quote",
    "table",
    "appendix",
    "map",
    "supplemental"
  ]);

  const geometryQualitySchema = z.enum(["placeholder", "authoritative", "mixed"]);

  const sourceRefSchema = z.object({
    source_page: z.number().int().min(1),
    source_type: sourceTypeSchema,
    source_id: z.string().optional(),
    note: z.string().optional()
  });

  const projectSchema = z.object({
    project_id: z.string().min(3),
    project_name: z.string().min(3),
    lifecycle_status: z.enum(["implementation", "preparation", "assessment", "closed"]),
    implementation_status: z.enum(["active", "pipeline", "on_hold", "closed"]),
    start_date_iso: z.string().min(4),
    end_date_iso: z.string().optional(),
    themes: z.array(z.string()),
    partners: z.array(z.string()),
    summary: z.string().min(3),
    metrics: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.number())])),
    source_refs: z.array(sourceRefSchema),
    geo_ref: z.object({
      layer_ids: z.array(z.string()),
      geometry_quality: geometryQualitySchema,
      geometry_source: z.string().min(3)
    }),
    confidence: z.number().min(0).max(1)
  });

  const countrySchema = z.object({
    iso3: z.string().length(3),
    name: z.string().min(2),
    status: countryStatusSchema,
    status_tags: z.array(countryStatusSchema).min(1),
    status_timeline: z.array(
      z.object({
        status: countryStatusSchema,
        as_of_date: z.string(),
        note: z.string(),
        source_page: z.number().int().min(1)
      })
    ),
    project_count: z.number().int().min(0),
    region: z.enum(["global", "africa", "asia", "latin_america"]),
    thematics: z.array(z.string()).min(1),
    summary: z.string().min(5),
    metrics: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.number())])),
    projects: z.array(projectSchema),
    partners: z.array(z.string()),
    featured_achievements: z.array(z.string()),
    stories: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        source_page: z.number().int().min(1)
      })
    ),
    source_refs: z.array(sourceRefSchema),
    quote: z.object({
      text: z.string(),
      attribution: z.string(),
      source_page: z.number().int().min(1)
    }),
    media: z.object({
      photos: z.array(z.string()),
      videos: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          source_page: z.number().int().min(1)
        })
      )
    }),
    geo_layers: z.array(z.string()),
    geo_ref: z.object({
      world_layer: z.string(),
      country_layers: z.array(z.string()),
      geometry_quality: geometryQualitySchema,
      geometry_source: z.string()
    }),
    confidence: z.number().min(0).max(1)
  });

  const globalSchema = z.object({
    data_model_version: z.string(),
    report: z.object({
      title: z.string(),
      year: z.number().int(),
      source_pdf: z.string(),
      last_updated: z.string()
    }),
    source_refs: z.array(sourceRefSchema).optional()
  });

  return { countrySchema, globalSchema };
}

async function main() {
  const errors = [];
  const warnings = [];

  const schemas = buildZodSchemas();

  const globalPath = path.join(CONTENT, "global.json");
  const globalJson = await readJson(globalPath);

  const globalResult = schemas
    ? schemas.globalSchema.safeParse(globalJson)
    : fallbackGlobalCheck(globalJson);

  if (!globalResult.success) {
    errors.push(`global schema invalid: ${globalResult.error}`);
  }

  const countriesDir = path.join(CONTENT, "countries");
  const countryFiles = (await fs.readdir(countriesDir)).filter((name) => name.endsWith(".json"));
  const countries = [];

  for (const file of countryFiles) {
    const payload = await readJson(path.join(countriesDir, file));
    const parsed = schemas ? schemas.countrySchema.safeParse(payload) : fallbackCountryCheck(payload);

    if (!parsed.success) {
      errors.push(`${file} schema invalid: ${parsed.error}`);
      continue;
    }

    const country = parsed.data;
    countries.push(country);

    if (!country.status_tags.includes(country.status)) {
      errors.push(`${file} status_tags must include status`);
    }

    const implementationProjects = country.projects.filter(
      (project) => project.lifecycle_status === "implementation"
    ).length;

    if (implementationProjects !== country.project_count) {
      errors.push(
        `${file} project_count (${country.project_count}) does not match implementation projects (${implementationProjects})`
      );
    }

    const countryPages = getPages(country);
    const outOfRange = countryPages.filter((page) => page < 1 || page > MAX_PAGE);
    if (outOfRange.length) {
      errors.push(`${file} has source_page out of range: ${outOfRange.join(", ")}`);
    }

    if (country.confidence < 0.5) {
      warnings.push(`${file} low confidence (${country.confidence})`);
    }
  }

  const totalActiveCountries = countries.filter((country) => country.project_count > 0).length;
  const totalProjects = countries.reduce((sum, country) => sum + country.project_count, 0);

  if (totalActiveCountries !== 18) {
    errors.push(`expected 18 countries with active projects, found ${totalActiveCountries}`);
  }

  if (totalProjects !== 35) {
    errors.push(`expected total project_count to equal 35, found ${totalProjects}`);
  }

  const globalPages = getPages(globalJson);
  const globalOutOfRange = globalPages.filter((page) => page < 1 || page > MAX_PAGE);
  if (globalOutOfRange.length) {
    errors.push(`global.json has source_page out of range: ${globalOutOfRange.join(", ")}`);
  }

  console.log("Validation summary");
  console.log(`- Countries validated: ${countries.length}`);
  console.log(`- Active countries: ${totalActiveCountries}`);
  console.log(`- Total projects: ${totalProjects}`);
  console.log(`- Warnings: ${warnings.length}`);
  warnings.forEach((warning) => console.log(`  WARN: ${warning}`));

  if (errors.length) {
    console.log(`- Errors: ${errors.length}`);
    errors.forEach((error) => console.log(`  ERROR: ${error}`));
    throw new Error("Content validation failed");
  }

  console.log("Content validation passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
