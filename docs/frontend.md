# Frontend Guide

Purpose: define the durable frontend implementation rules for `apps/web`.

## Quick Scan

- React, TypeScript, and Vite are the frontend baseline.
- TanStack Query owns server state; MSW backs frontend API tests.
- Keep data loading and side effects separate from presentational UI.
- Split view files by responsibility so each component is reviewable and
  testable in isolation.
- Frontend API calls use canonical backend resource paths.
- Shared HTTP utilities own response parsing and typed transport errors.
- UI primitives and design tokens come from a published design system,
  installed under the alias `@space-hero/design-system`. It is not in this
  repository — see `design-system.md`.
- No new npm dependency without explicit review and an Apache 2.0-compatible
  permissive license. See `dependencies.md`.

## Image Builds and Runtime

- Frontend image builds run from the monorepo root context via
  `pnpm run image:web`, which calls the engine's `build` (podman by default).
  The root context is required: the app's workspace dependencies are declared
  there.
- The Node version is a Dockerfile `ARG` default; keep it in step with `.nvmrc`.
- Use the local BuildKit cache mount. Buildah honours it, but the cache is not
  shared between engines.
- Keep Dockerfile stages as `deps -> build -> runtime`.
- Runtime image is unprivileged Nginx Alpine serving static Vite output.
- Nginx config must preserve SPA fallback (`/index.html`) for deep links.

## Structure and Ownership

Frontend source lives under `apps/web/src/` with shared directories at the top
level and view-specific code close to each view.

- Keep React components and hooks functional.
- Separate smart/container logic from dumb or presentational UI.
- Keep pure helpers in `utils` and async integrations in `services` or `infra`.
- Keep shared directories lean; promote code only after real reuse appears.
- Use lowercase kebab-case file and directory names.
- Avoid hardcoded API URLs; use `VITE_...` environment variables.
- Treat entity IDs as opaque UUID v7 strings.
- Screen state belongs in the URL; refresh and back/forward should preserve it.

## Data Fetching and Error Handling

- Use TanStack Query for all server state.
- Enable TanStack Query DevTools in development.
- Keep API handling in shared HTTP client utilities.
- Use the backend contract and OpenAPI paths as the source of truth for routes.
- Query-backed views render explicit loading, empty, success, and error states.
- Do not let API failures fall through to empty or success UI.
- HTTP clients throw a shared typed error with at least `status` and `message`.
- Parse HTTP error payloads in shared `infra/http` utilities, not in UI code.

Cache and data freshness:

- The global `staleTime` is `0` (stale-while-revalidate). Every mount triggers
  a background refetch; cached data is shown instantly.
- Do not use `staleTime: Infinity`. Use a finite value with a comment.
- Mutations that change shared resources must invalidate related query key
  prefixes.
- Do not cache API data in component state. Use TanStack Query keys so data
  participates in global invalidation.

## Contracts Package

- **No file extensions in imports.** Use `from "./identity"`, not
  `from "./identity.js"`.

## Date and Time

### Display formatting

- Never format dates inline in views or components. Use format helpers.
- Pass the user's timezone to format helpers.

### UTC construction and extraction

- Treat all API date-time strings as UTC (ISO 8601 with `Z` suffix).
- Use helpers from `utils/utc.ts` for UTC date construction and extraction.
- No external date libraries — use native `Date` and `Intl` API.
