# Local Toolchain

Purpose: how the local stacks are driven and why the tooling is shaped the way
it is. Setup steps (what to install and the commands to run) live in the
[README](../README.md#setup); this is the reference behind them.

## Container Engine

Podman is the standard engine ([ADR-0002](adr/ADR-0002-podman-is-the-container-engine.md)).
The compose files are Compose specification, not vendor-specific, and the
orchestration scripts run `podman compose`.

`podman compose` is a thin wrapper that points an existing Compose v2 at the
podman socket, so it runs the *same* Compose implementation a Docker developer
used to, and a given flag means the same thing. `podman-compose` — the separate
Python reimplementation — is *not* a working substitute: the readiness probe
calls `config --format json`, which `podman-compose` does not accept, so it
fails even when the machine is up. Do not point `PODMAN_COMPOSE_PROVIDER` or
`COMPOSE_COMMAND` at it.

Overrides, for the cases the default cannot express:

| Variable | Effect |
|----------|--------|
| `COMPOSE_COMMAND` | A full command, e.g. a specific binary or `docker compose` on a hosted runner that only has Docker. Overrides the default. Read from the environment first, then from the repository-root `.env`, which is where `scripts/init.mjs` records the answer to its container-engine question — a file survives opening a new shell, the variable overrides it for one command. |
| `COMPOSE_WAIT_TIMEOUT_SECONDS` | How long to wait for a service to become usable. Default 60. |
| `PODMAN_COMPOSE_PROVIDER` | Read by podman itself, not by us. Points at the Compose v2 binary podman should delegate to. |

On Windows and macOS podman runs containers inside a virtual machine with a
lifecycle of its own (`podman machine init` / `start` / `list`); on Linux
containers run natively. Every port the compose files publish (5432, 5433, 5434)
is above 1024, so rootless podman publishes them without extra configuration.
Keep it that way — adding a service on 80 or 443 would need
`net.ipv4.ip_unprivileged_port_start` changed on every developer's machine.

### Readiness

`upAndWait` in `scripts/lib/compose.mjs` — used by `db.mjs`, `dev.mjs` and both
test runners — starts services with `up --wait` and then probes the published
ports from the host. Both checks earn their place:

- `--wait` blocks on the healthchecks in the compose file. That is what
  separates a Postgres which has finished `initdb` from one that merely accepts
  a TCP connection.
- The port probe covers the gap between a healthy container and a working port
  mapping. Under rootless podman the forwarder is programmed separately from
  the container, and on Windows there is a machine hop on top of that.

There is deliberately no `inspect` call. Reading `.State.Health.Status` out of
a Go template is the one thing whose output shape the engine defines rather
than Compose, so it is the one thing that would need per-engine handling.

## Compose Projects

Each stack names its own Compose project, so `down` in one cannot reach
another:

| File | Project | Database | Host port |
|------|---------|----------|-----------|
| `infra/compose/compose.yml` | `app` | `app` | 5432 |
| `infra/compose/compose.test.yml` | `app-test` | `app_test` | 5433 |
| `infra/compose/compose.e2e.yml` | `app-e2e` | `app_e2e` | 5434 |

Without the `name:` key Compose derives the project from the compose file's
parent directory — all three would be `compose`, and `down` removes everything
carrying the project label rather than only the services named in `-f`. That is
how a test teardown deletes the dev database.

## Line Endings

Everything text is LF, in the index and in the working tree, on every platform.
`.gitattributes` enforces it with `* text=auto eol=lf`, which overrides
`core.autocrlf` — the Git for Windows installer sets that to `true` at system
level, so every Windows clone would otherwise check out CRLF.

This is not a style rule. `.sh` files are executed inside Linux images, where a
CRLF after the shebang is a syntax error; and the OpenAPI snapshot is written
with a hard `\n` and checked in CI with `git diff --exit-code`, so a CRLF
working tree makes that diff non-empty on Windows and empty on Linux.

## Why The Scripts Are Node

`scripts/*.mjs` rather than `scripts/*.sh`, because Node is already a hard
prerequisite of this repository and bash is not. Writing them in Node retires
five problems at once: the executable bit (which Windows checkouts drop), CRLF
in a shebang, the Git Bash dependency, cmd.exe, and PowerShell. The reasoning is
[ADR-0001](adr/ADR-0001-compose-is-the-contract-and-orchestration-is-node.md).

Two consequences worth knowing when editing them:

- **pnpm is not an ordinary executable on Windows.** It is a `.cmd` shim.
  `spawn` does not apply PATHEXT, so it must be named in full, and Node refuses
  to spawn a `.cmd` without a shell — that refusal is how CVE-2024-27980 was
  closed. Use `runPnpm` from `scripts/lib/run.mjs`, which handles both.
  `podman`, `dotnet` and `node` need none of this.
- **cmd.exe does not quote arguments for you.** With `shell: true` Node passes
  them through unquoted, truncating anything containing a space or a
  parenthesis. `runPnpm` quotes them, but cmd.exe cannot round-trip an embedded
  double quote at all — so anything a developer types on the command line is
  routed around pnpm entirely. `scripts/test-e2e.mjs` invokes Playwright's CLI
  with `node` for exactly that reason.

pnpm's `shellEmulator` setting would make `VAR=value cmd` work on Windows with
no new dependency, and is deliberately **not** enabled. It is a repo-wide
switch that changes the shell for every script in every workspace, including on
Linux and inside the image builds, and it is bash-*like* rather than bash — so
it fixes the syntax without fixing the portability.

## Which Suite Needs What

| Command | Needs | Notes |
|---------|-------|-------|
| `pnpm run test` | nothing | Unit, architecture, and the frontend. The database-backed integration facts **skip** and say so. |
| `pnpm run test:integration` | podman | Starts PostgreSQL on 5433, migrates, and runs the same xUnit suites with `DATABASE_URL` set, so nothing skips. |
| `pnpm run test:e2e` | podman, a Playwright browser | Its own PostgreSQL on 5434, its own API on 3100 and web server on 5273 — nothing shared with `pnpm run dev`. |

## Image Builds

`pnpm run image:api` and `pnpm run image:web` go through `scripts/image.mjs`,
which calls the engine's `build` directly — no Compose, and no shell, so they
run on Windows like everything else. The engine comes from the same resolution
as Compose, so `COMPOSE_COMMAND="docker compose"` also makes them build with
Docker.

The API image builds from `services/api` (self-contained); the web image builds
from the repository root, because it needs the workspace manifests its
dependencies are declared in. `pnpm run stack:up` builds both and runs them
against the dev database.

## Related Docs

- `delivery.md`: branching, commits, and incremental delivery
- `testing.md`: what the integration and E2E suites need
- `dependencies.md`: licence policy, which covers container base images
- `adr/ADR-0001-compose-is-the-contract-and-orchestration-is-node.md`: why Compose and Node
- `adr/ADR-0002-podman-is-the-container-engine.md`: why Podman is the standard
