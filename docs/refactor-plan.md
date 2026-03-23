# Platform Refactor Plan (Implemented Baseline)

## Review Findings

1. Data enrichment from `tenure_facility_country_jsons_v4` was disconnected from runtime content loaders and UI.
2. Report extraction evidence (KPI atoms, narrative snippets, source traces) existed but was not normalized into the platform schema.
3. Mapping logic (status/theme vocabulary translation) was duplicated across scripts and not centralized.
4. Country and thematic views could not leverage high-fidelity extracted signals for editorial or KPI depth.
5. CI/data validation did not include checks for this new extraction layer.

## Refactor Plan

1. Introduce a normalized supplemental data layer for extraction evidence (`country-signals`).
2. Extend shared platform types/schemas/loaders to support the new layer as first-class content.
3. Build deterministic ETL from v4 extraction pack to normalized signal files.
4. Centralize status/theme/direction mapping constants used by ETL and audit scripts.
5. Surface normalized signals in country and thematic experiences.
6. Add dedicated validation and CI hooks for the new layer.

## Implementation Status

### Completed

1. Added normalized `country-signals` data model and loaders:
   - `lib/types.ts`
   - `lib/content-schemas.ts`
   - `lib/content.ts`
2. Implemented ETL pipeline:
   - `scripts/build-country-signals.mjs`
   - outputs `content/country-signals/<ISO3>.json` and `content/country-signals/index.json`
3. Added validation:
   - `scripts/validate-country-signals.mjs`
4. Refactored mapping constants into shared module:
   - `scripts/utils/signal-mappings.mjs`
   - reused by ETL and audit scripts
5. Integrated signals into UI:
   - country view now includes extracted KPI signal panel + narrative evidence panel
   - thematic view now includes cross-country extracted evidence blocks filtered by theme
6. Wired scripts and CI:
   - package scripts: `build:signals`, `validate:signals`, `audit:v4`
   - quality workflow now runs build/validation for country signals

### Remaining (next refactor wave)

1. Promote curated signal metrics into theme/global KPI logic where appropriate.
2. Add project slug reconciliation table (`signal project slug -> live project_id`) and enforce referential checks.
3. Move narrative text cleanup into richer editorial rules (sentence restoration, de-footnoting, excerpt confidence scoring).
4. Add theme-aware search over signal narratives and organizations.
5. Add snapshot tests for ETL outputs to detect regressions in extraction pipelines.
