# Tenure Facility country JSONs v4

This package upgrades v3 by standardizing:
- `theme_tags` to a controlled vocabulary
- `direction` to a controlled vocabulary
- `project_or_initiative` into canonical `{slug, display_name}` objects when identifiable

Notes:
- Canonical project inference remains heuristic where the PDF was narrative rather than database-structured.
- Where no reliable project match could be inferred, `project_or_initiative` remains `null`.
