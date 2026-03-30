# Theme Texture Lab

Minimal temporary app for pairing theme slugs to texture files.

## Run

From repository root:

```bash
cd tools/theme-texture-lab
npm start
```

Open:

- http://localhost:4390

## What it reads

- `content/themes/*.json` (theme slugs + names)
- `photos/texture/*` (full texture set)
- `content/photo-assignments.json` (current theme texture mapping for reference)

## What it writes

On every save:

- `tools/theme-texture-lab/output/theme-texture-selections.json`

This output is intended as an intermediate file that can be applied into main content mappings.
