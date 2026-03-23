import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import {
  ChartContent,
  CountrySignalsContent,
  CountrySignalsIndexFile,
  CountryContent,
  GeoFeatureCollection,
  GlobalContent,
  MediaIndex,
  QuotesFile,
  ThemeContent
} from "@/lib/types";
import {
  chartContentSchema,
  countrySignalsContentSchema,
  countrySignalsIndexSchema,
  countryContentSchema,
  geoFeatureCollectionSchema,
  globalContentSchema,
  mediaIndexSchema,
  quotesFileSchema,
  themeContentSchema
} from "@/lib/content-schemas";

const contentRoot = path.join(process.cwd(), "content");

const readJsonRelative = cache(async (relativePath: string): Promise<unknown> => {
  const filePath = path.join(contentRoot, relativePath);
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as unknown;
});

async function readJsonFile<T>(...segments: string[]): Promise<T> {
  const relativePath = path.join(...segments);
  return (await readJsonRelative(relativePath)) as T;
}

function parseWithSchema<T>(schema: { parse: (value: unknown) => T }, payload: unknown, fileHint: string): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    throw new Error(`Content schema validation failed for ${fileHint}: ${String(error)}`);
  }
}

const listJsonFiles = cache(async (dir: string): Promise<string[]> => {
  const files = await fs.readdir(path.join(contentRoot, dir));
  return files.filter((file) => file.endsWith(".json"));
});

export const getGlobalContent = cache(async (): Promise<GlobalContent> => {
  const payload = await readJsonFile<unknown>("global.json");
  return parseWithSchema(globalContentSchema, payload, "content/global.json");
});

export const getCountries = cache(async (): Promise<CountryContent[]> => {
  const files = await listJsonFiles("countries");
  const countries = await Promise.all(
    files.map(async (file) => {
      const payload = await readJsonFile<unknown>("countries", file);
      return parseWithSchema(countryContentSchema, payload, `content/countries/${file}`);
    })
  );
  return countries.sort((a, b) => a.name.localeCompare(b.name));
});

export const getCountryByIso = cache(async (iso3: string): Promise<CountryContent | null> => {
  try {
    const fileName = `${iso3.toUpperCase()}.json`;
    const payload = await readJsonFile<unknown>("countries", fileName);
    return parseWithSchema(countryContentSchema, payload, `content/countries/${fileName}`);
  } catch {
    return null;
  }
});

export const getThemes = cache(async (): Promise<ThemeContent[]> => {
  const files = await listJsonFiles("themes");
  const themes = await Promise.all(
    files.map(async (file) => {
      const payload = await readJsonFile<unknown>("themes", file);
      return parseWithSchema(themeContentSchema, payload, `content/themes/${file}`);
    })
  );
  return themes.sort((a, b) => a.name.localeCompare(b.name));
});

export const getThemeBySlug = cache(async (slug: string): Promise<ThemeContent | null> => {
  try {
    const fileName = `${slug}.json`;
    const payload = await readJsonFile<unknown>("themes", fileName);
    return parseWithSchema(themeContentSchema, payload, `content/themes/${fileName}`);
  } catch {
    return null;
  }
});

export const getCharts = cache(async (): Promise<ChartContent[]> => {
  const files = await listJsonFiles("charts");
  const charts = await Promise.all(
    files.map(async (file) => {
      const payload = await readJsonFile<unknown>("charts", file);
      return parseWithSchema(chartContentSchema, payload, `content/charts/${file}`);
    })
  );
  return charts;
});

export const getChartBySlug = cache(async (slug: string): Promise<ChartContent | null> => {
  try {
    const fileName = `${slug}.json`;
    const payload = await readJsonFile<unknown>("charts", fileName);
    return parseWithSchema(chartContentSchema, payload, `content/charts/${fileName}`);
  } catch {
    return null;
  }
});

export const getMediaIndex = cache(async (): Promise<MediaIndex> => {
  const payload = await readJsonFile<unknown>("media", "index.json");
  return parseWithSchema(mediaIndexSchema, payload, "content/media/index.json");
});

export const getQuotes = cache(async (): Promise<QuotesFile> => {
  const payload = await readJsonFile<unknown>("quotes.json");
  return parseWithSchema(quotesFileSchema, payload, "content/quotes.json");
});

export const getWorldGeo = cache(async (): Promise<GeoFeatureCollection> => {
  const payload = await readJsonFile<unknown>("geo", "world-footprint.geojson");
  return parseWithSchema(geoFeatureCollectionSchema, payload, "content/geo/world-footprint.geojson");
});

export const getCountryGeo = cache(async (iso3: string, layer = "territories"): Promise<GeoFeatureCollection | null> => {
  try {
    const fileName = `${layer}.geojson`;
    const payload = await readJsonFile<unknown>("geo", iso3.toUpperCase(), fileName);
    return parseWithSchema(geoFeatureCollectionSchema, payload, `content/geo/${iso3.toUpperCase()}/${fileName}`);
  } catch {
    return null;
  }
});

export const getCountrySignalsIndex = cache(async (): Promise<CountrySignalsIndexFile | null> => {
  try {
    const payload = await readJsonFile<unknown>("country-signals", "index.json");
    return parseWithSchema(countrySignalsIndexSchema, payload, "content/country-signals/index.json");
  } catch {
    return null;
  }
});

export const getCountrySignals = cache(async (): Promise<CountrySignalsContent[]> => {
  try {
    const files = await listJsonFiles("country-signals");
    const signalFiles = files.filter((file) => file !== "index.json");
    const signals = await Promise.all(
      signalFiles.map(async (file) => {
        const payload = await readJsonFile<unknown>("country-signals", file);
        return parseWithSchema(countrySignalsContentSchema, payload, `content/country-signals/${file}`);
      })
    );
    return signals.sort((a, b) => a.country_name.localeCompare(b.country_name));
  } catch {
    return [];
  }
});

export const getCountrySignalsByIso = cache(async (iso3: string): Promise<CountrySignalsContent | null> => {
  try {
    const fileName = `${iso3.toUpperCase()}.json`;
    const payload = await readJsonFile<unknown>("country-signals", fileName);
    return parseWithSchema(countrySignalsContentSchema, payload, `content/country-signals/${fileName}`);
  } catch {
    return null;
  }
});
