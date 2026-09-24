# CI never runs on Windows

**Created:** 2026-08-11
**Module:** tooling / CI

## What

Windows is a supported development platform — the orchestration scripts are Node
precisely so that it is — but nothing verifies it. `pr-checks.yml` runs
`ubuntu-latest` only, so a change that works on Linux and breaks on Windows
(a `.cmd` shim, an unquoted argument through cmd.exe, a path separator, a CRLF)
merges green and is found by whoever runs it next.

## Why

GitHub's Windows runners can only run Windows containers, so every
compose-backed suite — `test:integration`, `test:e2e`, and the database steps —
cannot run there at all. A Windows job would therefore cover `build`, `lint`,
and the unit tests, and would double the CI bill for that subset.

## Resolution

Add a second job on `windows-latest` running only the container-free gates
(`pnpm install`, `pnpm run build`, `pnpm run lint`, `pnpm run test`). That is
where the platform-specific failures actually live: the script layer, not the
containers. Accept that the compose-backed suites stay Linux-only, and say so in
the workflow rather than leaving it to be inferred.
