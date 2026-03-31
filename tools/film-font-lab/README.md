# Film Font Lab

Temporary local app for selecting per-film title/detail fonts used by the `Our Films` page.

## Run

From repository root:

```bash
cd tools/film-font-lab
npm start
```

Open:

- http://localhost:4391

## What it does

- Shows each film in sequence.
- Lets you pick one font option per film.
- Supports save-and-resume (starts at first film without a saved choice).

## Output

On every save:

- `tools/film-font-lab/output/film-font-selections.json`

The output file can be used to apply font mappings into the frontend film metadata.

From repo root, apply the latest saved selections into the app:

```bash
npm run apply:film-fonts
```
