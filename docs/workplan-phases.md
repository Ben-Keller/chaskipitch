# Tenure Facility Platform Refinement Workplan

## Status legend

- `done`: implemented
- `in_progress`: started, partially implemented
- `planned`: scoped, not yet implemented

## Phase 1: Data model and validation foundation

Status: `in_progress`

### Delivered

- Added comprehensive input templates with placeholder seed data under `data-templates/`.
- Upgraded content schema to include:
  - `status_tags[]`
  - `status_timeline[]`
  - `projects[]`
  - `source_refs[]`
  - `confidence`
  - `geo_ref`
- Migrated all country records in `content/countries/*.json` to Phase 1 fields.
- Added `data_model_version` and global `source_refs` in `content/global.json`.
- Added schema definitions in `lib/content-schemas.ts`.
- Added schema-backed parsing in `lib/content.ts`.
- Added dataset QA scripts:
  - `npm run validate:data`
  - `npm run check:placeholders`
- Updated country detail page to display project portfolio from `projects[]`.

### Remaining to complete Phase 1

- Install dependencies and run validation in full `zod` mode (`npm install` required).
- Add CI gate for `validate:data`.
- Tighten schema constraints for chart/table units and date formats.
- Add automated migration script (`scripts/migrate-phase1.mjs`) to avoid manual updates in future cycles.

## Phase 2: Coverage expansion and extraction completeness

Status: `in_progress`

### Delivered

- Built page-by-page extraction matrix for pages 30-83:
  - `data-templates/editorial/phase2_page_matrix_30_83.json`
- Generated country-page signal map from pages 30-83:
  - `data-templates/editorial/phase2_country_signals.json`
- Updated report coverage tracker with phase-2 tags and fidelity flags:
  - `data-templates/editorial/report_coverage_tracker.csv`
- Expanded country records with additional stories and source references from underused sections.
- Replaced project placeholder names/summaries in live content with report-derived project records.
- Added additional quotes from Part Four pages and expanded thematic source coverage.
- Added `source_refs` and confidence metadata to all charts.

### Remaining

- Replace derived project labels with fully verified project names from partner records.
- Increase quote/story extraction depth for pages with dense multi-column narrative.
- Link appendix entities explicitly once appendix extraction table is finalized.

## Phase 3: Geospatial fidelity

Status: `in_progress`

### Delivered

- Integrated authoritative map inputs from root `geo/`:
  - `geo/countries_manifest.json`
  - `geo/countries_topojson/*.topo.json`
- Added build pipeline:
  - `npm run build:geo`
  - script: `scripts/build-authoritative-geo.mjs`
- Replaced placeholder world footprint geometry with authoritative country boundaries:
  - `content/geo/world-footprint.geojson` now generated from TopoJSON.
- Generated authoritative country boundary layers:
  - `content/geo/<ISO3>/boundary.geojson` for all platform countries.
- Updated country metadata for mixed geospatial quality:
  - `geo_layers` includes `boundary` + `territories`
  - `geo_ref.country_layers` includes `boundary` + `territories`
  - `geo_ref.geometry_quality` set to `mixed`
- Updated map UI:
  - global map labels use manifest label points
  - country map renders authoritative boundary base + territory overlay
- Added geospatial QA script:
  - `npm run validate:geo`
  - script: `scripts/validate-geospatial.mjs`

### Remaining

- Replace placeholder territory polygons with verified project-level geometries.
- Populate license metadata and source org metadata for each territory layer.
- Add topology/geometry simplification profiles for mobile performance.

## Phase 4: Interaction and editorial motion

Status: `in_progress`

### Delivered

- Replaced simple map click transition with a two-step cinematic camera path:
  - approach pass (tilt + bearing) then descend pass (settle into target bounds).
  - implementation in `components/global-map.tsx`.
- Added layered cloud transition system for both forward and reverse navigation:
  - reusable component `components/cloud-transition.tsx`.
  - used in `components/global-map.tsx` and `components/country-back-button.tsx`.
- Added map depth-atmosphere overlays:
  - vignette and haze layers on world map container.
- Added stronger editorial module on Home:
  - full-bleed chapter transition section with report photo treatment.
  - implementation in `components/home-dashboard.tsx`.
- Added reduced-motion fallbacks for new phase-4 motion patterns in CSS and transition timing logic.

### Remaining

- Build geotag-driven scrollytelling modules with map synchronization (deferred until geotagged narrative blocks are available).
- Add route-level chapter transition choreography between primary sections.
- Introduce media-sequenced country story transitions tied to verified geotagged assets.

## Phase 5: Chart and KPI fidelity

Status: `in_progress`

### Delivered

- Added per-figure chart configuration metadata for every chart file:
  - `chart_config` with figure id, axis units, x-key, and series definitions.
  - implemented via `scripts/enrich-phase5-content.mjs`.
- Added chart provenance metadata for every chart file:
  - `provenance.extraction_method`, `provenance.source_note`, `provenance.raw_input_refs`, `provenance.assumptions`.
- Added raw-data table metadata for every chart file:
  - `raw_table.columns` with column labels and units.
- Upgraded chart UI in `components/financial-chart.tsx`:
  - supports figure-configured series (including dual-axis line support for Figure 2 evolution chart).
  - adds `Show raw table` toggle for every chart.
  - adds provenance panel for every chart.
  - hover tooltips now include source note context.
- Added KPI derivation metadata and display logic at source level in `content/global.json`:
  - `kpi_derivation_registry`
  - `kpi_display_logic`
- Updated KPI selection logic in `components/home-dashboard.tsx` to use source-level `kpi_display_logic` rather than hardcoded theme branching.
- Updated KPI cards to display derivation method hints from `kpi_derivation_registry`.

### Remaining

- Refine thematic KPI derivation formulas with verified workbook formulas from `data-templates/kpi/kpi_source_workbook.csv`.
- Validate each mixed-unit chart against finalized figure extraction sheets and adjust per-series units/colors if needed.
- Add chart-level downloadable CSV export using the same raw table schema.

## Phase 6: Accessibility, QA, and performance hardening

Status: `in_progress`

### Delivered

- Added keyboard map navigation for country features in `components/global-map.tsx`:
  - Arrow keys cycle countries.
  - `Home`/`End` jump to first/last country.
  - `Enter`/`Space` opens focused country.
  - Added focus outline layer and keyboard helper controls in map legend.
- Added non-hover tooltip access for charts in `components/financial-chart.tsx`:
  - SVG bars/points are focusable and keyboard-operable.
  - `Enter`/`Space` pins tooltip; `Escape` clears pinned tooltip.
  - Added explicit interaction hint text per chart.
- Added reduced-motion safeguards:
  - Map transitions already honor `prefers-reduced-motion`.
  - Loading shimmer animations are disabled in reduced-motion mode.
- Performance hardening:
  - Map code-splitting on home route via dynamic import in `components/home-dashboard.tsx`.
  - Added route-level loading skeleton in `app/loading.tsx`.
  - Added server content caching with `react cache` in `lib/content.ts`.
  - Replaced key `<img>` usage with Next Image optimization in home and country views.
- QA hardening:
  - Added `scripts/validate-phase6-qa.mjs`.
  - Added npm script `npm run validate:qa`.
- Added keyboard parity for country-local map overlays in `components/country-map.tsx`:
  - Arrow keys cycle mapped territory/boundary features.
  - `Home`/`End` jump to first/last mapped area.
  - `Enter`/`Space` refocuses map on selected feature.
  - Added visible controls (`Previous area`, `Next area`, `Refocus map`) and live-region feedback.
- Added lightweight performance budget reporting:
  - Script: `scripts/check-performance-budget.mjs`
  - npm script: `npm run perf:budget`
  - Reports total JS/CSS bundle size, largest chunk, and route-level JS/CSS load metrics.
- Added CI quality gate workflow:
  - `.github/workflows/quality-gates.yml`
  - Runs geo build, data/geo/QA validation, typecheck, lint, app build, and performance budget checks.

### Remaining

- Run full local TypeScript/lint/build checks once dependencies are installed (`npm install`) and resolve any client-side runtime issues found during browser QA.
- Extend local-map keyboard targeting to additional geotagged layer types (points/lines) once those components are added.

## Input readiness checklist

Use `data-templates/README.md` and fill these first:

1. `projects/country_status_truth_table.csv`
2. `projects/project_master_list.csv`
3. `kpi/kpi_source_workbook.csv`
4. `figures/figure_1_table.csv` to `figures/figure_7_table.csv`
5. `geospatial/geospatial_manifest.csv`
6. `media/media_asset_manifest.csv`
7. `media/video_embed_list.csv`
8. `quotes/quote_registry.csv`
9. `design/design_tokens_template.json`
10. `editorial/editorial_priorities.csv`
