Shared app/pipeline asset root.

- The pipeline writes only final runtime assets here.
- For sequence layers, only final exported frames should remain (`frame_####.webp`).
- The React app serves this folder via `public/runtime/creative-pitch/assets` symlink.
- Cost-incurring provider artifacts are stored outside this folder under `../pipeline/runs/openai` and `../pipeline/runs/runway`.

This folder is the runtime asset shared surface.
The single control file is `../story.json`.
