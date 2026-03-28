Control files have been consolidated.

- Canonical control file: `../story.json`
- This `control/` folder is kept only for documentation and future migration notes.

Current motion model:

- Scene-level `gentleZoom` is the only motion decision.
- Per-layer camera moves, parallax values, and multi-keyframe transform controls are intentionally removed.
