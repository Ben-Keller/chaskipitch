Shared app/pipeline asset root.

- The pipeline writes generated stills and extracted sequence frames here.
- The Next.js app serves this folder via `rooted-site/public/assets` symlink.

This folder is the runtime asset shared surface.
Shared control CSVs live in `../control`.
