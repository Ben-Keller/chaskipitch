# Tenure Facility Annual Report 2024 Platform

A React + JavaScript editorial data platform that converts the 2024 annual report PDF into a map-led storytelling dashboard.

## Stack

- React + Vite
- D3 for maps, geospatial overlays, and interactive charts
- Structured JSON content layer (`/content`) for report data

## Run

```bash
npm install
npm run dev
```

Before `dev`/`build`, content JSON is synced to `public/content` automatically.
`public/content`, `public/creative-pitch/assets`, and `public/photos` are generated/symlinked artifacts and are not source-of-truth files.

Creative pitch source-of-truth:

- Story JSON: `creative-pitch/story.json` (synced to `content/creative-pitch-story.json` on prebuild/predev)
- Visual assets: `creative-pitch/assets` (symlinked to `public/creative-pitch/assets`)

The active runtime lives under `src/`. Legacy Next.js files remain in `app/` and top-level `components/` as reference only and are not part of the build pipeline.

## Information architecture

- `/` Home / Global Impact
- `/countries` Country Explorer
- `/countries/:iso3` Country drill-down storytelling scenes
- `/thematics` Thematics index
- `/thematics/:slug` Thematic views with KPIs, countries, and charts
- `/financials` Interactive financial chart section
- `/about` About / Method / Download

## Content schema

- `content/global.json`
- `content/countries/<ISO3>.json`
- `content/themes/<slug>.json`
- `content/charts/<slug>.json`
- `content/media/index.json`
- `content/quotes.json`
- `content/creative-pitch-story.json`
- `content/country-signals/index.json`
- `content/country-signals/<ISO3>.json`
- `content/geo/world-footprint.geojson`
- `content/geo/world-countries.geojson`
- `content/geo/authoritative-provenance.json`
- `content/geo/<ISO3>/territories.geojson`
- `content/geo/<ISO3>/boundary.geojson`

## Phase 1 model upgrades

Country records now include:

- `primary_status`
- `status_tags[]`
- `status_timeline[]`
- `projects[]` (project-level records)
- `source_refs[]`
- `confidence`
- `geo_ref`

Global metadata now includes:

- `data_model_version`
- `source_refs[]`

## Data templates

A full placeholder-seeded template set is available in:

- `data-templates/README.md`

It includes templates for:

- Country status truth table
- Project master list
- KPI source workbook
- Figure 1-7 raw data tables
- Geospatial manifest and layer registry
- Media and video manifests
- Quote registry
- Design tokens and motion specs
- Editorial priorities and report coverage tracker

## Validation and QA

```bash
npm run build:geo
npm run build:signals
npm run enrich:phase5
npm run validate:data
npm run validate:geo
npm run validate:signals
npm run validate:qa
npm run build
npm run perf:budget
npm run audit:v4
npm run check:placeholders
```

## Notes

- Values are extracted from visible report figures and chapter text.
- Country geometry layers are supplemental storytelling GeoJSON prepared outside the PDF.
- PDF is available in-app at `/report/tenure-facility-annual-report-2024.pdf`.
- Scrollytelling run outputs and backups are intentionally excluded from this repo.
