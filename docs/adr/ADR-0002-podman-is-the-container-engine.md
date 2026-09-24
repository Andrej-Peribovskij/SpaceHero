# ADR-0002: Podman is the standard container engine

**Status:** Accepted (narrows ADR-0001)

## Context

[ADR-0001](ADR-0001-compose-is-the-contract-and-orchestration-is-node.md) made
the Compose specification the contract and left the engine behind it open. That
is the right call while a team runs a mix of engines, and the wrong one once it
does not: auto-detecting Docker first means a machine with both installed
silently uses Docker, and "works on my machine" differences follow — image-cache
behaviour, rootless networking, troubleshooting steps.

Docker Desktop's licensing is the practical reason to standardize on Podman.
Nothing in ADR-0001's substance changes: the compose files are still Compose
specification, the orchestration is still Node, and shell is still not a build
prerequisite. What narrows is only the engine those scripts assume.

## Decision

**Podman is the supported container engine.** The orchestration scripts run
`podman compose` and do not look for Docker.
`COMPOSE_COMMAND` stays as the one escape hatch: it names a full
command outright, for `podman-compose`, a specific binary, or `docker compose`
on a hosted runner that only ships Docker.

Concretely:

- `scripts/lib/engine.mjs` defaults to `["podman", "compose"]` and errors with a
  Podman-specific message when `podman compose` is unavailable.
- The compose files live at `infra/compose/compose*.yml` and the web image build
  calls `podman build`. The names carry no vendor.
- CI sets `COMPOSE_COMMAND: podman compose` so the compose-backed
  suites run on Podman like a developer's machine.

## Consequences

Easier:

- One engine, so the cache behaviour, the rootless networking, and the
  troubleshooting steps a developer hits are the same as everyone else's and the
  same as CI's.
- No silent Docker-first default on a machine that happens to have both.

Harder:

- `podman compose` delegates to an external Compose v2 provider, which has to be
  on `PATH`. Podman Desktop installs one; a bare `podman` may not — the failure
  message says so and `PODMAN_COMPOSE_PROVIDER` points at a specific one.
- A hosted CI runner has Docker by default and may not have Podman's compose
  provider wired. The `COMPOSE_COMMAND` escape hatch is what makes
  that recoverable without a code change.
