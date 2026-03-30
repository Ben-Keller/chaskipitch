# Photo Country + Y-Offset Lab

Isolated temporary mini app for manually assigning:
- country mapping per photo
- one of 4 y-offset crop positions

The app is self-contained in this folder and can be deleted after use.

## Run

From repository root:

```bash
cd tools/photo-country-offset-lab
npm start
```

Open:

- http://localhost:4388

## What it reads

- `photos/picture/**`
- `photos/portrait/**`
- `content/countries/*.json` (country search list)
- `content/photo-assignments.json` (current mapping shown for reference)

## What it writes

On every **Save + Next** click, it updates:

- `tools/photo-country-offset-lab/output/photo-country-offset-selections.json`

This file is intended as an intermediate output that you can use later to update the main mapping data.

## Notes

- Country input supports searchable countries and manual text entry.
- You can select one or more slices; `y_offset` is saved as the average of selected slice offsets.
- Slice offsets are based on: `-45`, `-15`, `15`, `45`.
- `NA` is available as a country option. When `NA` is selected, crop selection is optional and can be left empty.
