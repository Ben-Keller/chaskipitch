Shared app/pipeline asset root.

- The pipeline writes only final runtime assets here.
- For sequence layers, only final exported frames should remain (`frame_####.webp`).
- The React app serves this folder via `public/runtime/creative-pitch/assets` symlink.

This folder is the runtime asset shared surface.
Shared control CSVs live in `../control`.
