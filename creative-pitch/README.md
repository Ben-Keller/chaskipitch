# Creative Pitch Assets

This folder is the canonical source for the integrated scrollytelling experience used by the main dashboard app.

## Structure

- `story.json`: source story schema for the creative pitch
- `assets/`: runtime visual assets referenced by `story.json`
- `control/`: optional control/reference tables used during content authoring

## Runtime sync

During `npm run dev` / `npm run build`:

- `creative-pitch/story.json` is synced to `content/creative-pitch-story.json`
- `creative-pitch/assets` is linked/copied to `public/runtime/creative-pitch/assets`

## Pipeline note

Generated run outputs are not part of this repo.

Pipeline hygiene policy:

- Keep only provider-cost outputs (`openai/`, `runway/`) under:
  - `creative-pitch/pipeline/runs/`
  - `creative-pitch/pipeline/run_backups/`
- Clear `creative-pitch/pipeline/output/` after each run.
- Keep only final exported sequence frames in `creative-pitch/assets` (`frame_####.webp`).
