# Docs Index

Purpose: map the durable technical docs for this repository.

Use `openspec/` for active change work and durable product specs, and `process/design/` for
design versions — the seven prompts, their templates and the exporter.

## Start Here

- `architecture.md`: system scope, module map, integration philosophy
- `tooling.md`: the container engine, line endings, and why the scripts are the
  way they are (setup steps live in the top-level README)
- `backend.md`: backend implementation rules
- `frontend.apps.md`: frontend implementation rules for `apps/`
- `design-system.md`: consuming the published design system, and the registry
  token every install needs
- `testing.md`: testing policy and minimum scenarios
- `delivery.md`: branching, commits, and incremental delivery
- `dependencies.md`: third-party licensing policy — required reading before
  adding any package, font, image, or model

## The Design Layer

The conventions the design → code process is held to. The process itself —
prompts, templates, the exporter — is in `process/design/`, and the commands
that invoke it are in `design-commands/`.

- `design-versioning.md`: `vX.Y.Z`, `-tech`, `PUBLIC_UI_VERSION`, the reserved
  namespace
- `design-version-registry.md`: the version registry contract `apps/web` is held
  to
- `design-folder.md`: the `pages/design/**` layout and its four invariants
- `design-staging.md`: the design system's staging area and promotion rules
- `design-testing.md`: what the design layer tests, when, and what it
  deliberately does not
- `design-local-components.md`: components `apps/web` ships itself on purpose —
  the record half of prompt 05's contribution gate

## Supporting Docs

- `observability.md`: error reporting, PII handling, debugging, and deploy config
- `glossary.md`: canonical project terminology
- `tech-debt/`: accepted shortcuts, gaps, and deferred cleanup
- `adr/`: durable architectural decisions — the four here are load-bearing
- `generated/README.md`: generated artifact rules
