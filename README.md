# My App

Full-stack monorepo scaffolding with a C#/.NET backend, a React frontend, an
AI-agent harness, and a spec-driven workflow. **Node is the single orchestrator**
for the whole repo — every task runs through `pnpm run …` — while each backend
service is a self-contained .NET solution.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | C# / .NET 10 (ASP.NET Core, EF Core), PostgreSQL |
| Frontend | React, TypeScript, Vite, Tailwind CSS v4, TanStack Query |
| UI Library | Radix UI, shadcn/ui patterns |
| Contracts | OpenAPI snapshot → generated TypeScript types (`openapi-typescript`) |
| Testing | xUnit, WebApplicationFactory, Vitest, Testing Library, Playwright |
| Orchestration | pnpm workspaces (frontend), MSBuild (backend), Podman |
| Agent Harness | Claude Code, OpenSpec, structured docs |

## Prerequisites

The repo runs on **Windows, macOS, and Linux**. Install:

| Tool | Version | Notes |
|------|---------|-------|
| [.NET SDK](https://dotnet.microsoft.com/download) | 10.0.x | Pinned in `services/api/global.json` |
| [Node.js](https://nodejs.org) | LTS | Version pinned in `.nvmrc` (`nvm use`) |
| [pnpm](https://pnpm.io) | pinned | Supplied by corepack: `corepack enable pnpm` |
| [Podman](https://podman.io) | with Compose v2 | For local PostgreSQL and container builds |

**Podman is the standard engine** ([ADR-0002](docs/adr/ADR-0002-podman-is-the-container-engine.md)).
The scripts call `podman compose`, which delegates to Docker Compose v2 —
Podman Desktop installs one, or `brew install docker-compose`. The Python
`podman-compose` is not a substitute. On macOS and Windows start the VM once
with `podman machine init && podman machine start`.

Docker still works: set `COMPOSE_COMMAND="docker compose"`, which also switches
the image builds. That is the escape hatch for a CI runner that only ships
Docker, not the default.

No global .NET tools are required — the pinned `dotnet-ef` tool is restored per
service. Line endings are normalized to LF via `.gitattributes`, so scripts
behave identically on every platform.

## Getting Started

**Before the first install, one line in your own `~/.npmrc`, on a line of its
own — if the file exists, check it ends with a newline before appending:**

```
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

…then `export NODE_AUTH_TOKEN=<a personal access token with read:packages>`.
The design system is published to GitHub Packages, which authenticates reads as
well as writes. It has to be a **user-level** file: pnpm ignores an auth setting
in a committed project `.npmrc`, so this repository's own carries only the
scope-to-registry routing. A `.pnpmfile.cjs` hook checks for it before anything
is fetched, and refuses with the file, the line and what is wrong with it
rather than letting the install fail with an unexplained 401. Full
detail, including CI and image builds: [docs/design-system.md](docs/design-system.md).

```bash
pnpm install          # install frontend deps + restore the .NET tool manifest
pnpm run db:up        # start PostgreSQL and wait until its port answers
pnpm run db:migrate   # apply database migrations
pnpm run db:seed      # seed development data (optional)

pnpm run dev          # PostgreSQL + the API (:3000) + the web app (:5173), together
```

`pnpm run dev` runs everything in one terminal (Ctrl+C stops it all). The web app
reads its API URL at runtime and defaults to `http://localhost:3000`, which
matches the API's development port — so the two connect out of the box. To run
just one side, use `pnpm run backend:dev` or `pnpm --filter ./apps/web run dev`.

## Project Structure

```
services/api/          Self-contained .NET service (the backend)
  global.json          Pins the .NET SDK
  api.slnx             Solution spanning the service's projects
  Directory.*.props    Shared build rules + central NuGet versions
  .config/             Pinned dotnet-ef tool manifest
  src/
    Host/              Composition root (Program.cs), auth, errors, OpenAPI, health
    BuildingBlocks/    Framework-neutral primitives (clock, ids, actor, errors)
    Persistence/       EF Core DbContext, conventions, migrations, seeding
    Modules/Example/   Reference module: Domain / Application / Contracts / Infrastructure
apps/web/              React + Vite frontend (pnpm workspace)
packages/schemas/      OpenAPI snapshot + generated TypeScript types
tests/e2e/             Playwright flows against a real browser, API and database
scripts/               Node orchestrators bridging pnpm → dotnet / podman
infra/compose/         Compose files: dev (5432), test (5433), e2e (5434)
docs/                  Durable technical documentation
openspec/              Spec-driven feature workflow
```

Backend boundaries are enforced at the **assembly** level: `Domain` and
`Application` reference no framework; cross-module access goes only through a
module's `Contracts` project.

## Scripts

All commands are cross-platform (`pnpm run …`).

| Script | Description |
|--------|------------|
| `pnpm run dev` | Start PostgreSQL + the API + the web app together |
| `pnpm run backend:dev` | Run just the API (`http://localhost:3000`) |
| `pnpm run build` | Build backend (.NET) + frontend workspaces |
| `pnpm run lint` | Lint backend (`dotnet format`) + ESLint over the whole tree |
| `pnpm run typecheck` | `tsc --noEmit` in every package that has TypeScript — a separate step, because `lint` is ESLint and cannot see a type |
| `pnpm run test` | Backend + frontend tests; the database-backed ones skip and say so |
| `pnpm run test:integration` | Backend integration tests against a throwaway PostgreSQL |
| `pnpm run test:e2e` | Playwright end-to-end tests |
| `pnpm run openapi:sync` | Regenerate the OpenAPI snapshot + typed clients |
| `pnpm run openapi:check` | Fail if the committed OpenAPI snapshot is stale |
| `pnpm run db:up` / `db:down` | Start / stop PostgreSQL (`-- -v` also drops its volume) |
| `pnpm run db:migrate` | Apply database migrations |
| `pnpm run db:seed` | Seed development data |
| `pnpm run db:refresh` | Reset, migrate, and re-seed the database |
| `pnpm run stack:up` / `stack:down` | Build and run the full container stack (DB + API) |
| `pnpm run image:api` / `image:web` | Build a service/app container image |
| `pnpm run public-version` | Show which UI version this repository declares public, and where |
| `pnpm run public-version:set <version>` | Write it everywhere it is declared — prompt 06's apply step. Prints the line to set in a deployment; it cannot set one itself |

Backend-only equivalents (`backend:build`, `backend:test`, `backend:lint`) run
the .NET service directly via `scripts/backend.mjs`.

## Set Your Project Up

This is a template, and the first install offers to make it yours. `prepare`
runs `scripts/init.mjs` on the first install and asks five questions:

| | Question | Default |
|---|---|---|
| 0 | New project, or the template itself? | read from `origin` — you are not asked |
| 1 | Project name, PascalCase | — |
| 2 | Design system | `uds` |
| 3 | Container engine | `podman` |
| 4 | Git remotes | `detach` |

Question 0 answers itself: a clone whose `origin` is still
`PTV-Mobility/scaffolding` is somebody improving the template, so it is asked
nothing. A repository made with **Use this template** has its own origin and
falls through to the real questions. Question 4's `detach` renames `origin` to
`upstream` and clears `origin`, which is what turns the sync-from-the-template
path from a paragraph of documentation into a working remote.

Nothing here deletes anything: question 2 writes a dependency line, and the JWT
secret is not a question at all — init writes a random one, because a template
that ships a known secret is a footgun rather than a choice.

Run it yourself at any time, or drive it headlessly:

```bash
pnpm run init
pnpm run init --name AcmeShop --design-system uds --engine podman --remotes detach --yes
pnpm install               # refresh the lockfile
pnpm run verify            # confirm everything is green
```

**It can never block a pipeline or an agent.** The `prepare` path passes
`--auto`, which returns immediately with a one-line pointer whenever any of
four things is true: already initialised, `CI` is set, standard input is not a
terminal, or `SCAFFOLD_SKIP_INIT=1`.

The rebrand itself is still `pnpm run rename <PascalName>` and still does one
job — rewriting `SpaceHero`/`space-hero` across every text file and renaming the
`.csproj` files. `init` calls it.

## Adding a Service or App

- **New backend service:** create `services/<name>/` as its own .NET solution
  (copy the `services/api` spine), then register it with the Node orchestrator.
- **New frontend app:** add `apps/<name>/` — it is picked up automatically by the
  workspace glob in `pnpm-workspace.yaml`.

## Documentation

Start with `docs/README.md` for the full documentation index, or `CLAUDE.md` for
the agent operating guide.
