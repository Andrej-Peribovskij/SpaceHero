# Glossary

Purpose: canonical terminology for the project. Add new terms as they appear
in the domain. Use these terms consistently in code, docs, and specs.

## How to Use

- Use the term exactly as defined here in code identifiers, API fields, and
  documentation.
- When a new domain concept appears, add it here in the same change.
- When a term is retired or renamed, update this glossary and all references.

## Terms

<!-- Add domain-specific terms below in alphabetical order -->
<!-- Example:
| Term | Definition |
|------|-----------|
| Journey | A coaching engagement between a coach and coachee |
-->

| Term | Definition |
|------|-----------|
| Production export | Prompt 04 §4: a readable source tree of what the registry's production entry serves — its screens and every file they reach, at their real paths — exported directly, with no `-tech` revision. Written by `export-design-version.mjs --mode production`. Not a design-version export, which copies one self-contained folder |
| Recorded fixture | An API answer recorded with a `GET` from a running local stack by `capture-fixtures.mjs`, kept under `FIXTURES_DIR/<version>/` as a production export's mock data. Recorded, never hand-written |
| Fixture curation | Declared edits to recorded fixtures that each remove one named artefact of a development database, applied by `curate-fixtures.mjs`. Never changes a figure; idempotent; every edit's note is repeated in the export README |
