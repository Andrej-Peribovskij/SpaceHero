# Frontend Apps Guide

Purpose: define the durable implementation rules for applications in `apps/`
(currently `apps/web`). For the design system these apps consume, see
`docs/design-system.md`.

## Quick Scan

- React, TypeScript, and Vite are the frontend baseline.
- TanStack Query owns server state; MSW backs frontend API tests.
- Keep data loading and side effects separate from presentational UI.
- Split view files by responsibility so each component is reviewable and
  testable in isolation.
- Frontend API calls use canonical backend resource paths.
- Shared HTTP utilities own response parsing and typed transport errors.
- **Always consume components, icons, and tokens from `@space-hero/design-system`.**
  Never hand-roll primitives or hardcode design values. If something is missing,
  raise it with the design system's owners or record tech debt — the package is
  a different repository and cannot be extended from a feature branch here.
- No new npm dependency without explicit review and an Apache 2.0-compatible
  permissive license. See `dependencies.md`.

## Design System Consumption

This is the **primary rule** for `apps/` code:

- **Use `@space-hero/design-system` components** for every UI primitive (buttons,
  inputs, dialogs, tags, icons, form controls, etc.). Do not re-implement a
  primitive at the app level when one exists in the package.
- **Use design tokens** from the package — reference semantic tokens via the
  `bg-[var(--color-...)]` Tailwind arbitrary value syntax, or the utilities
  generated from `@theme`. Never hardcode hex colors, pixel sizes, ad-hoc
  spacing, or non-token font values in app code.
- **When a required component or token is missing from `@space-hero/design-system`:**
  1. Check the staging export, `@space-hero/design-system/staging` — it holds
     components that exist but have not been promoted yet.
  2. Otherwise raise it with the design system's owners. Extending it is a pull
     request against its own repository, on its own release cadence.
  3. If the product cannot wait, build it locally **and** create a tech debt
     record in `docs/tech-debt/` naming what should replace it.

### Importing from `@space-hero/design-system`

`@space-hero/design-system` is an alias for whichever design system package this
project uses; `apps/web/package.json` records which one and at which version.
Import from the alias and from its public entry points, never from a path inside
the package:

```tsx
// Correct
import { Button, Card, DataTable } from "@space-hero/design-system";

// Wrong — the file layout is not the contract
import { Button } from "@space-hero/design-system/dist/components/Button";
```

## Structure and Ownership

Frontend source lives under `apps/web/src/` with shared directories at the top
level and view-specific code close to each view.

- Keep React components and hooks functional.
- Separate smart/container logic from dumb or presentational UI.
- Keep pure helpers in `utils` and async integrations in `services` or `infra`.
- Keep shared directories lean; promote code only after real reuse appears.
- Use lowercase kebab-case file and directory names.

## Data Fetching and Error Handling

- Use TanStack Query for all server state.
- Enable TanStack Query DevTools in development.
- Keep API handling in shared HTTP client utilities.
- Query-backed views render explicit loading, empty, success, and error states.
- Do not let API failures fall through to empty or success UI.
- HTTP clients throw a shared typed error with at least `status` and `message`.
- Parse HTTP error payloads in shared `infra/http` utilities, not in UI code.
