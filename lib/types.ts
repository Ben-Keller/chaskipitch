export type RegionKey = "global" | "africa" | "asia" | "latin_america";

export type CountryStatus =
  | "active"
  | "additional_2024"
  | "first_time_2024"
  | "preparing"
  | "under_assessment";

export type SourceType = "figure" | "chapter" | "quote" | "table" | "appendix" | "map" | "supplemental";

export interface SourceRef {
  source_page: number;
  source_type: SourceType;
  source_id?: string;
  note?: string;
}

export type ProjectLifecycleStatus = "implementation" | "preparation" | "assessment" | "closed";

export type GeometryQuality = "placeholder" | "authoritative" | "mixed";

export interface KpiValue {
  id: string;
  label: string;
  value: number;
  unit: string;
  source_page: number;
}

export interface KpiDerivationEntry {
  kpi_id: string;
  label: string;
  scope: "global" | "regional" | "theme";
  theme?: string;
  region?: RegionKey;
  method: string;
  formula: string;
  input_refs: string[];
  source_pages: number[];
  source_figure?: string;
  unit: string;
  note?: string;
}

export interface KpiDisplayLogic {
  default_theme_mode: "theme_native" | "hero_global_with_region_overrides";
  theme_modes: Record<string, "theme_native" | "hero_global_with_region_overrides">;
  regional_override_kpi_ids: string[];
  regional_recomputed_kpi_ids: string[];
  regional_recompute_scope: "visible_country_selection";
  note?: string;
}

export interface RegionalKpiSet {
  hectares_positively_impacted: number;
  communities_positively_impacted?: number;
  hectares_secured?: number;
  communities_in_secured_areas?: number;
  active_projects?: number;
  countries?: number;
  note?: string;
  source_page: number;
}

export interface TimelineMilestone {
  year: number;
  label: string;
  description: string;
  source_page: number;
  metrics?: Record<string, number>;
}

export interface GlossaryItem {
  term: string;
  definition: string;
  source_page: number;
}

export interface GlobalContent {
  data_model_version?: string;
  report: {
    title: string;
    year: number;
    source_pdf: string;
    last_updated: string;
  };
  hero_kpis: KpiValue[];
  regional_kpis: Record<RegionKey, RegionalKpiSet>;
  status_definitions: Array<{
    id: CountryStatus;
    label: string;
    description: string;
    source_page: number;
    color: string;
  }>;
  timeline: TimelineMilestone[];
  glossary: GlossaryItem[];
  methodology: {
    summary: string;
    source_pages: number[];
  };
  source_refs?: SourceRef[];
  kpi_derivation_registry?: KpiDerivationEntry[];
  kpi_display_logic?: KpiDisplayLogic;
  about: {
    vision: string;
    mission: string;
    values: Array<{
      name: string;
      description: string;
      source_page: number;
    }>;
    pillars: Array<{
      title: string;
      description: string;
      source_page: number;
    }>;
  };
}

export interface CountryStory {
  title: string;
  summary: string;
  source_page: number;
  source_refs?: SourceRef[];
}

export interface ProjectContent {
  project_id: string;
  project_name: string;
  lifecycle_status: ProjectLifecycleStatus;
  implementation_status: "active" | "pipeline" | "on_hold" | "closed";
  start_date_iso: string;
  end_date_iso?: string;
  themes: string[];
  partners: string[];
  summary: string;
  metrics: Record<string, number | string | boolean | number[]>;
  source_refs: SourceRef[];
  geo_ref: {
    layer_ids: string[];
    geometry_quality: GeometryQuality;
    geometry_source: string;
  };
  confidence: number;
}

export interface CountryContent {
  iso3: string;
  name: string;
  primary_status?: CountryStatus;
  status: CountryStatus;
  status_tags: CountryStatus[];
  status_timeline: Array<{
    status: CountryStatus;
    as_of_date: string;
    note: string;
    source_page: number;
  }>;
  project_count: number;
  region: RegionKey;
  thematics: string[];
  summary: string;
  metrics: Record<string, number | string | boolean | number[]>;
  projects: ProjectContent[];
  partners: string[];
  featured_achievements: string[];
  stories: CountryStory[];
  source_refs: SourceRef[];
  quote: {
    text: string;
    attribution: string;
    source_page: number;
  };
  media: {
    photos: string[];
    videos: Array<{ title: string; url: string; source_page: number }>;
  };
  geo_layers: string[];
  geo_ref: {
    world_layer: string;
    country_layers: string[];
    geometry_quality: GeometryQuality;
    geometry_source: string;
  };
  confidence: number;
}

export interface ThemeContent {
  slug: string;
  name: string;
  description: string;
  source_pages: number[];
  kpis: KpiValue[];
  related_countries: string[];
  related_stories: string[];
  related_charts: string[];
  source_refs?: SourceRef[];
}

export interface ChartContent {
  slug: string;
  title: string;
  source_page: number;
  chart_type: "line" | "bar" | "stacked_bar" | "paired_metric";
  units: string;
  data_points: Array<Record<string, string | number>>;
  footnotes: string[];
  source_refs?: SourceRef[];
  confidence?: number;
  chart_config?: {
    figure_id: string;
    figure_title?: string;
    x_key: string;
    x_label?: string;
    y_left_label?: string;
    y_left_unit?: string;
    y_right_label?: string;
    y_right_unit?: string;
    series: Array<{
      key: string;
      label: string;
      type: "line" | "bar";
      axis: "left" | "right";
      color: string;
      unit?: string;
      stack_group?: string;
    }>;
  };
  raw_table?: {
    columns: Array<{
      key: string;
      label: string;
      unit?: string;
    }>;
  };
  provenance?: {
    extraction_method: "transcribed_from_figure" | "derived_from_report_text" | "mixed";
    source_note: string;
    raw_input_refs: string[];
    assumptions?: string[];
  };
}

export interface MediaIndex {
  photos: Array<{
    id: string;
    file: string;
    caption: string;
    credit: string;
    alt: string;
    source_page: number;
  }>;
  videos: Array<{
    id: string;
    title: string;
    embed_url: string;
    caption: string;
    source_page: number;
  }>;
}

export interface QuoteItem {
  id: string;
  text: string;
  attribution: string;
  source_page: number;
  theme: string;
}

export interface QuotesFile {
  quotes: QuoteItem[];
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number>;
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

export type V4MapStatus =
  | "active_project_country"
  | "additional_projects_began_implementation_in_2024"
  | "projects_being_prepared"
  | "under_assessment_for_future_projects";

export type CountrySignalDirection =
  | "count"
  | "recognize"
  | "measure_area"
  | "share"
  | "share_baseline"
  | "share_result"
  | "map"
  | "benefit"
  | "report"
  | "secure"
  | "mobilize"
  | "elect"
  | "train";

export interface CountrySignalProjectRef {
  slug: string;
  display_name: string;
}

export interface CountrySignalKpi {
  id: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  metric_family: string;
  direction: CountrySignalDirection;
  beneficiary_group: string | null;
  kpi_category: string;
  time_period: string;
  project_or_initiative: CountrySignalProjectRef | null;
  theme_tags: string[];
  geography_scope: string;
  source_page: number;
  source_heading: string | null;
  source_text: string;
}

export interface CountrySignalNarrative {
  id: string;
  kind: "project_description" | "qualitative_highlight";
  title: string;
  body: string;
  narrative_type: string;
  project_or_initiative: CountrySignalProjectRef | null;
  theme_tags: string[];
  organizations_mentioned: string[];
  related_kpi_ids: string[];
  related_metric_families: string[];
  signal_type: string | null;
  highlight_category: string | null;
  source_page: number;
}

export interface CountrySignalsContent {
  iso3: string;
  country_name: string;
  region: RegionKey;
  map_status: V4MapStatus;
  mapped_status: CountryStatus;
  live_status: CountryStatus | null;
  status_mismatch: boolean;
  project_count: number;
  source_report: string;
  source_pages: number[];
  canonical_projects: CountrySignalProjectRef[];
  organizations: string[];
  kpis: CountrySignalKpi[];
  narratives: CountrySignalNarrative[];
  quality_flags: Array<{
    type: string;
    message: string;
    entity_id?: string;
    source_page?: number;
  }>;
  notes: string[];
  coverage: {
    structured_kpi_count: number;
    narrative_count: number;
    project_description_count: number;
    qualitative_highlight_count: number;
  };
  generated_from: {
    schema_version: string;
    generated_at_utc: string;
    source_file: string;
  };
}

export interface CountrySignalsIndexItem {
  iso3: string;
  country_name: string;
  region: RegionKey;
  map_status: V4MapStatus;
  mapped_status: CountryStatus;
  live_status: CountryStatus | null;
  status_mismatch: boolean;
  project_count: number;
  kpi_count: number;
  narrative_count: number;
  quality_flag_count: number;
  source_pages: number[];
}

export interface CountrySignalsIndexFile {
  generated_at_utc: string;
  source_folder: string;
  countries: CountrySignalsIndexItem[];
  summary: {
    country_count: number;
    total_kpis: number;
    total_narratives: number;
    total_quality_flags: number;
    status_mismatch_countries: string[];
  };
}
