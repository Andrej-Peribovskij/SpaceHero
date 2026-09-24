# Reference images for the design export

`ASSETS_DIR`. Prompt 04's exporter is handed this folder as `--assets`, and finds in it the
human-supplied static images that stand in for content it cannot generate itself. Both of its
modes read it: a design-version export (§3) and a production export (§4), which matches entries
against every file the production version's screens reach, not only one version folder. An image
registered once serves both.

## Why this exists

The export is deliberately **code-only and browser-free** (prompt 04 rule 3): a pure `node:fs`
copy, no Playwright, no screenshots, no install. That is what lets the export half run on its own
with no dev server and no backend. The cost is that anything which only produces pixels once its
library actually runs — a live map, a WebGL scene, a canvas chart — arrives in the design tool as
source the tool cannot draw. A committed screenshot fills that hole without putting a browser in
the export path.

These images are **this product's data**, not the process's, so they live here beside the
wrappers rather than under `process/design/`. Commit them like any other project asset: a
reference image on one person's machine makes the export reproducible for exactly one designer.

## `registry.json`

A JSON array. Each entry claims one image for the files that use a live-render library:

```json
[
  {
    "id": "corridor-map",
    "file": "corridor-map.png",
    "exportAs": "reference/corridor-map.png",
    "description": "The corridor map at the default zoom, with two detours drawn.",
    "matchSpecs": ["maplibre-gl"],
    "matchPattern": "CorridorMap"
  }
]
```

| Field | Meaning |
|---|---|
| `id` | unique within this file; the export's README lists it |
| `file` | the image, relative to this folder |
| `exportAs` | where it lands inside the export tree |
| `description` | one line, for the person reading the export |
| `matchSpecs` | live-render import specifiers that make this entry a candidate |
| `matchPattern` | optional regular expression that must also appear in the file's source |
| `versions` | optional non-empty list of version ids (`["v2.0.0", "v2.1.0-tech"]`); when present, the entry serves only an export of one of them |

**Scope an entry with `versions` when the file it matches is shared between versions.** Matching
is on a file's source, and a file that several versions reach — a map component, a style constant
— reads the same in all of them. Without `versions`, a picture taken of one version's screen
attaches to every other version's export of that file too. With it, an export of an unlisted
version skips the entry, and the file is reported as unresolved there unless another entry
covers it. A version id means both a design entry and a production entry of that id; a `-tech`
revision is its own id and must be listed separately. An entry without `versions` serves every
version, as before.

A file that uses a live-render library and matches no entry is **reported as unresolved** in the
export README rather than silently omitted — that report is the prompt telling you which
screenshot is missing.

The array starts empty. That is a valid state: a version with no live-render content needs no
image, and the exporter says so.
