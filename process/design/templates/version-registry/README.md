# The version registry reference

The source of the one piece of application code this process does not leave to judgement: the UI
version registry and the machinery around it. It lives in the app, at
`apps/web/src/versions/`; this folder holds what that code is copied from and checked against.

A generator used to write it into a host repository and re-check it on every run. There is one
repository now, so the copy is a copy: process-owned files here and in `apps/web/src/versions/`
are meant to be identical, and a change to one is made here first and copied down in the same
commit.

Read `docs/design-version-registry.md` for what these
files are held to and why. This file only says what is in the box.

## Frontend — `frontend/` → `<FRONTEND_PACKAGE>/src/versions/`

| Template | Written as | Owner |
|---|---|---|
| `registry.tsx` | `registry.tsx` | **the project** — seeded once, never regenerated |
| `public-config.ts` | `public-config.ts` | **the project** — seeded once, never regenerated |
| `registry-core.ts` | `registry-core.ts` | the process — kept identical to this copy |
| `public-version.tsx` | `public-version.tsx` | the process — kept identical to this copy |
| `version-base.tsx` | `version-base.tsx` | the process — kept identical to this copy |
| `mount.tsx` | `mount.tsx` | the process — kept identical to this copy |
| `registry.contract.test.ts` | `registry.contract.test.ts` | the process — kept identical to this copy |
| `README.md` | `README.md` | the process — kept identical to this copy |

The split is the whole design. This app's **versions, guards and reserved roots** are its own
and change constantly; the **rules for reading a version table** do not change and belong here,
where a fix is reviewed as a change to the process rather than as a change to one screen.

## Backend — `backend/`

Not copied for you. An API endpoint is an architectural decision about the service, and the
prompts report the endpoint missing rather than inventing it. Copy the reference that matches
the stack — here that is `backend/dotnet/`, into `services/api`:

- `backend/dotnet/` — ASP.NET Core minimal APIs, the reference implementation's own shape
- `backend/node/` — an Express/Fastify-shaped handler and the framework-free reader under it

The contract both satisfy is in [backend/README.md](backend/README.md).

## Substitutions

The templates are valid TypeScript and C# as they stand. Four tokens are placeholders, all of
them inside string literals so nothing here is unparseable in an editor; fill them in as you
copy.

| Token | This repository |
|---|---|
| `"__RESERVED_ROOTS__"` | `"login", "register", "admin", "design", "legacy", "api", "ws", "assets"` |
| `__PROD_VERSION_ID__` | `v1.0.0` |
| `__PUBLIC_CONFIG_PATH__` | `/api/v1/public-config` |
| `__API_NAMESPACE__` | the API module's namespace, when you copy the .NET template |

## Framework assumptions

React and React Router v6+, which is what `apps/web` runs. The registry's *rules*
(`registry-core.ts`) are framework-free; `mount.tsx`, `version-base.tsx` and
`public-version.tsx` are React Router-shaped.
