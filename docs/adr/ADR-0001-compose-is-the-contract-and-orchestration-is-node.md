# ADR-0001: Compose is the contract, and orchestration is Node

**Status:** Accepted

> The engine-agnostic stance below is narrowed by
> [ADR-0002](ADR-0002-podman-is-the-container-engine.md): Podman is the standard
> and Docker is not supported by default. Everything else here — Compose as the
> contract, Node orchestration, shell not a build prerequisite — still holds.

## Context

Repositories built from this template are worked on from Linux, macOS and
Windows. Two assumptions do not survive that, and both are easy to bake in
without noticing:

- **The engine is Docker.** The literal string `docker` ends up in the compose
  helper, the test scripts, the image builds and `package.json`, including
  `docker inspect` with a Go template reading `.State.Health.Status`. Docker
  Desktop's licensing is why several teams moved to Podman Desktop, and that
  string is what stops the move.
- **A POSIX shell exists.** A dev loop written as bash scripts, plus
  `package.json` scripts using shell syntax directly (a `VAR=value` prefix,
  `! grep -rn`), fails on Windows: pnpm runs scripts through cmd.exe there, so
  `build`, `lint` and the browser wrappers all break.

Requiring Git Bash answers the second point but not the first, and makes an
optional install load-bearing for the primary dev loop.

## Decision

**The Compose specification is the contract, not Docker.** Anything the scripts
call must be Compose surface — `up --wait`, `down`, `config --format json`.
Engine-defined surface is off-limits, which is why container health is checked
with `up --wait` plus a host-side probe of the published port rather than with
`inspect` and a Go template. `COMPOSE_COMMAND` overrides the
command outright for anything the default cannot express.

**Orchestration scripts are Node, and shell is not a build prerequisite.** Node
is already required by every `pnpm run` in the repository. Anything a developer
invokes must run unchanged from bash, PowerShell and cmd.exe.

## Consequences

Easier:

- One code path serves every operating system. The compose files, which are the
  actual configuration, do not fork.
- Script failures can explain themselves — which port never answered, which
  engine was chosen — instead of surfacing as `set -e` exiting silently.
- The executable bit, CRLF shebangs and `chmod +x` stop mattering, because
  nothing is executed as a script.

Harder:

- Spawning pnpm on Windows is genuinely awkward: it is a `.cmd`, so it needs
  its full name *and* a shell, and cmd.exe does not quote arguments. Anything
  carrying developer-typed arguments has to route around pnpm. `runPnpm` in
  `scripts/lib/run.mjs` is the single place that knows this.
- CI covers one engine on one OS. GitHub's Windows runners can only run Windows
  containers, so the Linux-container suites cannot run there at all — see
  `docs/tech-debt/no-windows-ci-coverage.md`.
- The Node version an image builds on is a Dockerfile `ARG` default rather than
  `.nvmrc`. Reading `.nvmrc` needs it pinned to a concrete `X.Y.Z`, which is a
  decision each project should make for itself; until then the two can drift.
