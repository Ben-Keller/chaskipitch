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

- Story JSON: `creative-pitch/story.json` (authored control)
- Timing config: `creative-pitch/pipeline/config.json` (frame-count defaults, render quality, stage commands)
- Runtime story: `public/runtime/creative-pitch/story.json` (generated during sync)
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
- `Evolution & Finance` Unified organizational evolution dashboard with interactive timeline, threads visualization, funding flow, institutional indicators, and methodology context
- `Creative Pitch` Story experience with sequenced visual layers

## Content schema

- `content/global.json`
- `content/countries/<ISO3>.json`
- `content/themes/<slug>.json`
- `content/charts/<slug>.json`
- `content/media/index.json`
- `content/quotes.json`
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

## Deploy To Vercel

Vercel is a good fit for this app:

- Static Vite output (`dist`) with no server runtime required
- Automatic preview deploys per branch/PR
- Fast CDN delivery for map/media assets

This repo is preconfigured for Vercel via `vercel.json`:

- Install: `npm ci`
- Build: `npm run build` (includes runtime content sync via `prebuild`)
- Output: `dist`

### Dashboard setup (recommended)

1. Push this repository to GitHub.
2. In Vercel: **Add New Project** -> import the repository.
3. Framework preset: **Vite**.
4. Root Directory: project root (`/`).
5. Confirm:
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. Set environment variables (optional):
   - `VITE_ENABLE_CREATIVE_PITCH=false` to reduce deployment size
   - `VITE_REPORT_URL=https://...` if serving PDF from external storage
7. Deploy.

### CLI setup (optional)

```bash
npm i -g vercel
vercel login
vercel
vercel --prod
```

### Post-deploy checks

1. Load `/` and confirm the Impact map renders.
2. Confirm `runtime/content` JSON requests return 200.
3. Open a country context card and verify photos/videos resolve.
4. If Creative Pitch is enabled, verify sequence frames load from `runtime/creative-pitch/assets`.

## Notes

- Values are extracted from visible report figures and chapter text.
- Country geometry layers are supplemental storytelling GeoJSON prepared outside the PDF.
- PDF is available in-app at `/report/tenure-facility-annual-report-2024.pdf`.
- Scrollytelling run outputs and backups are intentionally excluded from this repo.
