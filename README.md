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

Before `dev`/`build`, content JSON is synced to `public/runtime/content` automatically.
`public/runtime/content`, `public/runtime/creative-pitch/assets`, and `public/runtime/photos` are generated/symlinked artifacts and are not source-of-truth files.

Creative pitch source-of-truth:

- Story JSON: `creative-pitch/story.json` (synced to `content/creative-pitch-story.json` on prebuild/predev)
- Visual assets: `creative-pitch/assets` (symlinked to `public/runtime/creative-pitch/assets`)

The runtime lives under `src/` only. The project is now a single-framework React + Vite app.

## Source Layout

- `src/app/` UI runtime (pages + components)
- `src/lib/` data-loading hooks and shared utilities
- `sources/` raw upstream source datasets used by build scripts
  - `sources/country-v4/`
  - `sources/videos_full.json`

## Information architecture

- `Impact` Global map, thematic filtering, KPI strips, evidence and video panels
- `Financials` Chart-led financial section with editorial blocks
- `About` Methodology, KPI framing, and report links
- `Creative Pitch` Story experience with sequenced visual layers

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
- `content/manifest.json` (generated slug/index manifest used by runtime loaders)

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

## Unified Pipeline

```bash
npm run pipeline:build     # build derived content artifacts
npm run pipeline:validate  # run all validators
npm run pipeline:ci        # build artifacts + validate + build app + perf budget + generated-content check
npm run repo:audit         # report large tracked files and top-level size usage
```

Additional optional scripts are still available for targeted runs (`audit:v4`, `check:placeholders`, `enrich:phase5`).

Creative pitch sequence optimization:

- Upscaled sequence frames (`frame_####.png`) are automatically converted to WebP during `predev`/`prebuild` and pipeline builds.
- Default behavior removes source PNG frames after successful conversion (`REMOVE_UPSCALED_PNG=false` keeps PNGs).
- Optional quality override: `WEBP_QUALITY=<number>` (default `82`).
- Pipeline cleanup policy is enforced during sequence build:
  - In `creative-pitch/pipeline/runs` and `creative-pitch/pipeline/run_backups`, only OpenAI/Runway outputs are retained.
  - `creative-pitch/pipeline/output` is cleared after runs.
  - In `creative-pitch/assets`, only final exported sequence frames are kept (`frame_####.webp`).

## Deployment Size Controls

- Disable creative pitch runtime (and avoid shipping sequence assets):
  - `VITE_ENABLE_CREATIVE_PITCH=false`
- Use a hosted PDF instead of repository-local report binary:
  - `VITE_REPORT_URL=https://.../tenure-facility-annual-report-2024.pdf`
- Audit tracked repository size before pushing:
  - `npm run repo:audit`

## Notes

- Values are extracted from visible report figures and chapter text.
- Country geometry layers are supplemental storytelling GeoJSON prepared outside the PDF.
- PDF is available in-app at `/report/tenure-facility-annual-report-2024.pdf`.
- Scrollytelling run outputs and backups are intentionally excluded from this repo.
