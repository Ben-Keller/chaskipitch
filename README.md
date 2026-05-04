# Chaski Global Page

This repository contains the Chaski Global interactive page: a React + Vite experience for exploring Tenure Facility work through global mapping, thematic filters, country context, KPIs, evidence, photography, and film references.

## Stack

- React
- Vite
- D3 for map rendering and geospatial overlays
- Structured JSON content under `data/content`

## Local Run

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

Before `dev` and `build`, the app syncs content and static assets into `public/` automatically.

## Project Scope

This README is intentionally focused on the Chaski Global page only.

The main runtime areas relevant to client handoff are:

- `src/dashboard-page.jsx` — primary Chaski Global page experience
- `src/global-map-d3.jsx` — map rendering and interaction logic
- `src/dashboard-support.jsx` — dashboard helpers, defaults, and formatting
- `src/content.js` — runtime content loading
- `src/styles.css` — shared visual styling

## Source Layout

- `src/` — frontend runtime and UI logic
- `data/content/` — processed application content consumed by the frontend
- `data/source/` — raw upstream source files used by build scripts
- `assets/photos/` — source photography and textures
- `assets/static/` — static assets mirrored into `public/`
- `scripts/` — content sync and build helpers

## Content Model

Key runtime content files:

- `data/content/global.json`
- `data/content/countries/<ISO3>.json`
- `data/content/evidence/<ISO3>.json`
- `data/content/signals/index.json`
- `data/content/signals/<ISO3>.json`
- `data/content/themes/<slug>.json`
- `data/content/media/index.json`
- `data/content/media/quotes.json`
- `data/content/media/country-videos.json`
- `data/content/media/photo-assignments.json`
- `data/content/geo/world-footprint.geojson`
- `data/content/geo/world-countries.geojson`
- `data/content/geo/authoritative-provenance.json`
- `data/content/geo/<ISO3>/territories.geojson`
- `data/content/geo/<ISO3>/boundary.geojson`
- `data/content/manifest.json`

Country records include:

- `primary_status`
- `status_tags[]`
- `status_timeline[]`
- `projects[]`
- `source_refs[]`
- `confidence`
- `geo_ref`

Global records include:

- `data_model_version`
- `source_refs[]`

## Useful Commands

```bash
npm run pipeline:build
npm run pipeline:validate
npm run pipeline:ci
npm run repo:audit
```

These are useful when updating the content layer or verifying repository health.

## Notes

- Values are derived from the report data and supporting editorial/source materials.
- Country geometry layers are supplemental storytelling GeoJSON prepared from files in `data/source/geo/`.
- Runtime-generated content under `public/runtime/` is build output, not source of truth.
