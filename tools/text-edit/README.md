# Text Edit

Minimal local UI to edit `new_text` values and persist every `Save + Next` click.

## Run

From repository root (recommended):

```bash
npm run text:edit
```

Or directly:

```bash
cd tools/text-edit
npm start
```

Open:

- http://localhost:4392

## Default file

By default it edits:

- `tmp/platform-text-edits-ui.json`

Generate that file first:

```bash
npm run text:export:ui
```

## Optional alternate file

You can point it to another text-edit JSON:

```bash
TEXT_EDIT_FILE=tmp/platform-text-edits.json npm start
# (from repo root: npm run text:edit:all)
```
