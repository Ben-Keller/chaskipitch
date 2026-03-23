import { z } from "zod";

export const countryStatusSchema = z.enum([
  "active",
  "additional_2024",
  "first_time_2024",
  "preparing",
  "under_assessment"
]);

export const sourceTypeSchema = z.enum([
  "figure",
  "chapter",
  "quote",
  "table",
  "appendix",
  "map",
  "supplemental"
]);

export const sourceRefSchema = z.object({
  source_page: z.number().int().min(1),
  source_type: sourceTypeSchema,
  source_id: z.string().optional(),
  note: z.string().optional()
});

const kpiValueSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  source_page: z.number().int().min(1)
});

const kpiDerivationEntrySchema = z.object({
  kpi_id: z.string(),
  label: z.string(),
  scope: z.enum(["global", "regional", "theme"]),
  theme: z.string().optional(),
  region: z.enum(["global", "africa", "asia", "latin_america"]).optional(),
  method: z.string(),
  formula: z.string(),
  input_refs: z.array(z.string()),
  source_pages: z.array(z.number().int().min(1)),
  source_figure: z.string().optional(),
  unit: z.string(),
  note: z.string().optional()
});

const kpiDisplayLogicSchema = z.object({
  default_theme_mode: z.enum(["theme_native", "hero_global_with_region_overrides"]),
  theme_modes: z.record(z.enum(["theme_native", "hero_global_with_region_overrides"])),
  regional_override_kpi_ids: z.array(z.string()),
  regional_recomputed_kpi_ids: z.array(z.string()),
  regional_recompute_scope: z.enum(["visible_country_selection"]),
  note: z.string().optional()
});

const regionalKpiSetSchema = z.object({
  hectares_positively_impacted: z.number(),
  communities_positively_impacted: z.number().optional(),
  hectares_secured: z.number().optional(),
  communities_in_secured_areas: z.number().optional(),
  active_projects: z.number().optional(),
  countries: z.number().optional(),
  note: z.string().optional(),
  source_page: z.number().int().min(1)
});

const timelineMilestoneSchema = z.object({
  year: z.number().int(),
  label: z.string(),
  description: z.string(),
  source_page: z.number().int().min(1),
  metrics: z.record(z.number()).optional()
});

const glossaryItemSchema = z.object({
  term: z.string(),
  definition: z.string(),
  source_page: z.number().int().min(1)
});

export const globalContentSchema = z.object({
  data_model_version: z.string().optional(),
  report: z.object({
    title: z.string(),
    year: z.number().int(),
    source_pdf: z.string(),
    last_updated: z.string()
  }),
  hero_kpis: z.array(kpiValueSchema),
  regional_kpis: z.object({
    global: regionalKpiSetSchema,
    africa: regionalKpiSetSchema,
    asia: regionalKpiSetSchema,
    latin_america: regionalKpiSetSchema
  }),
  status_definitions: z.array(
    z.object({
      id: countryStatusSchema,
      label: z.string(),
      description: z.string(),
      source_page: z.number().int().min(1),
      color: z.string()
    })
  ),
  timeline: z.array(timelineMilestoneSchema),
  glossary: z.array(glossaryItemSchema),
  methodology: z.object({
    summary: z.string(),
    source_pages: z.array(z.number().int().min(1))
  }),
  source_refs: z.array(sourceRefSchema).optional(),
  kpi_derivation_registry: z.array(kpiDerivationEntrySchema).optional(),
  kpi_display_logic: kpiDisplayLogicSchema.optional(),
  about: z.object({
    vision: z.string(),
    mission: z.string(),
    values: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        source_page: z.number().int().min(1)
      })
    ),
    pillars: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        source_page: z.number().int().min(1)
      })
    )
  })
});

export const countryStorySchema = z.object({
  title: z.string(),
  summary: z.string(),
  source_page: z.number().int().min(1),
  source_refs: z.array(sourceRefSchema).optional()
});

const geometryQualitySchema = z.enum(["placeholder", "authoritative", "mixed"]);
const regionKeySchema = z.enum(["global", "africa", "asia", "latin_america"]);

export const projectContentSchema = z.object({
  project_id: z.string(),
  project_name: z.string(),
  lifecycle_status: z.enum(["implementation", "preparation", "assessment", "closed"]),
  implementation_status: z.enum(["active", "pipeline", "on_hold", "closed"]),
  start_date_iso: z.string(),
  end_date_iso: z.string().optional(),
  themes: z.array(z.string()),
  partners: z.array(z.string()),
  summary: z.string(),
  metrics: z.record(z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
  source_refs: z.array(sourceRefSchema),
  geo_ref: z.object({
    layer_ids: z.array(z.string()),
    geometry_quality: geometryQualitySchema,
    geometry_source: z.string()
  }),
  confidence: z.number().min(0).max(1)
});

export const countryContentSchema = z.object({
  iso3: z.string().length(3),
  name: z.string(),
  primary_status: countryStatusSchema.optional(),
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
  region: regionKeySchema,
  thematics: z.array(z.string()),
  summary: z.string(),
  metrics: z.record(z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
  projects: z.array(projectContentSchema),
  partners: z.array(z.string()),
  featured_achievements: z.array(z.string()),
  stories: z.array(countryStorySchema),
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

const v4MapStatusSchema = z.enum([
  "active_project_country",
  "additional_projects_began_implementation_in_2024",
  "projects_being_prepared",
  "under_assessment_for_future_projects"
]);

const countrySignalDirectionSchema = z.enum([
  "count",
  "recognize",
  "measure_area",
  "share",
  "share_baseline",
  "share_result",
  "map",
  "benefit",
  "report",
  "secure",
  "mobilize",
  "elect",
  "train"
]);

const countrySignalProjectRefSchema = z.object({
  slug: z.string(),
  display_name: z.string()
});

export const countrySignalKpiSchema = z.object({
  id: z.string(),
  metric: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  metric_family: z.string(),
  direction: countrySignalDirectionSchema,
  beneficiary_group: z.string().nullable(),
  kpi_category: z.string(),
  time_period: z.string(),
  project_or_initiative: countrySignalProjectRefSchema.nullable(),
  theme_tags: z.array(z.string()),
  geography_scope: z.string(),
  source_page: z.number().int().min(1),
  source_heading: z.string().nullable(),
  source_text: z.string()
});

export const countrySignalNarrativeSchema = z.object({
  id: z.string(),
  kind: z.enum(["project_description", "qualitative_highlight"]),
  title: z.string(),
  body: z.string(),
  narrative_type: z.string(),
  project_or_initiative: countrySignalProjectRefSchema.nullable(),
  theme_tags: z.array(z.string()),
  organizations_mentioned: z.array(z.string()),
  related_kpi_ids: z.array(z.string()),
  related_metric_families: z.array(z.string()),
  signal_type: z.string().nullable(),
  highlight_category: z.string().nullable(),
  source_page: z.number().int().min(1)
});

export const countrySignalsContentSchema = z.object({
  iso3: z.string().length(3),
  country_name: z.string(),
  region: regionKeySchema,
  map_status: v4MapStatusSchema,
  mapped_status: countryStatusSchema,
  live_status: countryStatusSchema.nullable(),
  status_mismatch: z.boolean(),
  project_count: z.number().int().min(0),
  source_report: z.string(),
  source_pages: z.array(z.number().int().min(1)),
  canonical_projects: z.array(countrySignalProjectRefSchema),
  organizations: z.array(z.string()),
  kpis: z.array(countrySignalKpiSchema),
  narratives: z.array(countrySignalNarrativeSchema),
  quality_flags: z.array(
    z.object({
      type: z.string(),
      message: z.string(),
      entity_id: z.string().optional(),
      source_page: z.number().int().min(1).optional()
    })
  ),
  notes: z.array(z.string()),
  coverage: z.object({
    structured_kpi_count: z.number().int().min(0),
    narrative_count: z.number().int().min(0),
    project_description_count: z.number().int().min(0),
    qualitative_highlight_count: z.number().int().min(0)
  }),
  generated_from: z.object({
    schema_version: z.string(),
    generated_at_utc: z.string(),
    source_file: z.string()
  })
});

export const countrySignalsIndexItemSchema = z.object({
  iso3: z.string().length(3),
  country_name: z.string(),
  region: regionKeySchema,
  map_status: v4MapStatusSchema,
  mapped_status: countryStatusSchema,
  live_status: countryStatusSchema.nullable(),
  status_mismatch: z.boolean(),
  project_count: z.number().int().min(0),
  kpi_count: z.number().int().min(0),
  narrative_count: z.number().int().min(0),
  quality_flag_count: z.number().int().min(0),
  source_pages: z.array(z.number().int().min(1))
});

export const countrySignalsIndexSchema = z.object({
  generated_at_utc: z.string(),
  source_folder: z.string(),
  countries: z.array(countrySignalsIndexItemSchema),
  summary: z.object({
    country_count: z.number().int().min(0),
    total_kpis: z.number().int().min(0),
    total_narratives: z.number().int().min(0),
    total_quality_flags: z.number().int().min(0),
    status_mismatch_countries: z.array(z.string())
  })
});

export const themeContentSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  source_pages: z.array(z.number().int().min(1)),
  kpis: z.array(kpiValueSchema),
  related_countries: z.array(z.string()),
  related_stories: z.array(z.string()),
  related_charts: z.array(z.string()),
  source_refs: z.array(sourceRefSchema).optional()
});

export const chartContentSchema = z.object({
  slug: z.string(),
  title: z.string(),
  source_page: z.number().int().min(1),
  chart_type: z.enum(["line", "bar", "stacked_bar", "paired_metric"]),
  units: z.string(),
  data_points: z.array(z.record(z.union([z.string(), z.number()]))),
  footnotes: z.array(z.string()),
  source_refs: z.array(sourceRefSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  chart_config: z
    .object({
      figure_id: z.string(),
      figure_title: z.string().optional(),
      x_key: z.string(),
      x_label: z.string().optional(),
      y_left_label: z.string().optional(),
      y_left_unit: z.string().optional(),
      y_right_label: z.string().optional(),
      y_right_unit: z.string().optional(),
      series: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          type: z.enum(["line", "bar"]),
          axis: z.enum(["left", "right"]),
          color: z.string(),
          unit: z.string().optional(),
          stack_group: z.string().optional()
        })
      )
    })
    .optional(),
  raw_table: z
    .object({
      columns: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          unit: z.string().optional()
        })
      )
    })
    .optional(),
  provenance: z
    .object({
      extraction_method: z.enum(["transcribed_from_figure", "derived_from_report_text", "mixed"]),
      source_note: z.string(),
      raw_input_refs: z.array(z.string()),
      assumptions: z.array(z.string()).optional()
    })
    .optional()
});

export const mediaIndexSchema = z.object({
  photos: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      caption: z.string(),
      credit: z.string(),
      alt: z.string(),
      source_page: z.number().int().min(1)
    })
  ),
  videos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      embed_url: z.string(),
      caption: z.string(),
      source_page: z.number().int().min(1)
    })
  )
});

export const quotesFileSchema = z.object({
  quotes: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      attribution: z.string(),
      source_page: z.number().int().min(1),
      theme: z.string()
    })
  )
});

export const geoFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.record(z.union([z.string(), z.number()])),
      geometry: z.object({
        type: z.enum(["Polygon", "MultiPolygon"]),
        coordinates: z.any()
      })
    })
  )
});
