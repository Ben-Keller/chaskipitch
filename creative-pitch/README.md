# Creative Pitch Assets

This folder is the canonical source for the integrated scrollytelling experience used by the main dashboard app.

## Structure

- `story.json`: source story schema for the creative pitch
- `assets/`: runtime visual assets referenced by `story.json`
- `control/`: optional control/reference tables used during content authoring

## Runtime sync

During `npm run dev` / `npm run build`:

- `creative-pitch/story.json` is synced to `content/creative-pitch-story.json`
- `creative-pitch/assets` is linked/copied to `public/creative-pitch/assets`

## Pipeline note

Generated run outputs are not part of this repo. If a generation pipeline is used, keep only `runs/` as the archival workspace. `run_backups/` is intentionally deprecated.
