# Delivery

Purpose: conventions for branching, commits, and incremental delivery.

## Development Philosophy

Work iteratively and incrementally. Deliver small, working slices rather than
large batches. Each commit should leave the codebase in a working state.

## What CI Runs, and When

`pr-checks.yml` starts with a `changes` job that classifies the pull request's
paths (`scripts/ci-changed.mjs`). A change that touches only prose — `docs/`,
`openspec/`, `process/design/` outside its `scripts/`, `design-commands/`, a
top-level `.md` — runs the link check and nothing else. Anything else runs the
full gate: .NET, pnpm, PostgreSQL, both compose-backed suites and a browser.

The classifier errs towards running everything. An unrecognised path counts as
code, and so does an empty change set: a run that proves nothing should look
like a run rather than like a pass. If you add a directory that cannot affect a
build, add it to `DOCS_ONLY` **and** to `scripts/ci-changed.test.mjs`, which is
where the reasoning is recorded.

## Branching

All work starts on a feature branch. Never edit, propose, or commit on `main`.
This applies equally to OpenSpec proposals, code changes, doc tweaks, and any
`/opsx:propose` or `/opsx:apply` runs.

**Branch name pattern:** `<type>/<scope>/<slug>`

- `<type>` — one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`
  (matches the Conventional Commits type used for the eventual commit title).
- `<scope>` — the affected module or area (e.g. `auth`, `onboarding`,
  `ui`, `frontend`, `backend`).
- `<slug>` — short kebab-case description of the change. For OpenSpec changes,
  the change name is a good slug.

Examples: `feat/auth/session-management`, `fix/auth/silent-refresh`,
`chore/deps/upgrade-efcore`, `docs/frontend/structure`.

**When to create the branch:** before any artifact is written or any file is
edited. For OpenSpec, this means before `pnpm run spec:new <change-slug>`.

**Uncommitted changes:** if the working tree is dirty when a new branch is
needed, stop and ask the user how to handle it (stash, commit, or abort). Do
not auto-stash or auto-commit.

## Commits

- Follow [Conventional Commits](https://www.conventionalcommits.org/) for
  commit messages.
- Group changes into commits that tell a coherent story. A reviewer reading the
  commit log should understand the progression of the change without needing to
  read every diff at once.
- Separate concerns across commits: a migration, the domain logic it enables,
  and the UI that consumes it are three distinct commits — not one.
- Avoid mixing unrelated changes in the same commit. Refactors, formatting
  fixes, and feature work belong in separate commits even when done in the same
  session.
- Keep each commit buildable and test-passing when practical. This makes
  bisecting and reverting easier.

## Incremental Delivery

- Prefer multiple small slices over one large change when the work can be split
  into independently releasable pieces.
- Each slice should be functional on its own.
- When a feature spans multiple slices, document the sequence and dependencies
  in the relevant OpenSpec tasks or design notes.

## Cross-Platform Tooling

Every developer command must run on **Windows, macOS, and Linux**. `pnpm run …` is
the single entry point; keep it portable.

Rules:

- **Write repo automation as Node** (`scripts/*.mjs`), not shell. There are no
  `.sh` scripts in the repo, and `npm` scripts contain no bash-only constructs.
- **No inline `VAR=value command`** in `npm` scripts — that syntax is POSIX-only
  and fails on Windows `cmd`. Set environment variables inside a Node script
  (`spawn(..., { env })`) instead.
- **Spawn executables directly** (`dotnet`, `node`) so they resolve on Windows;
  reach for `shell: true` only when running a shell built-in or a `.cmd` shim.
- **Container commands go through `scripts/lib/compose.mjs`.** Podman is the
  standard engine (ADR-0002) and `COMPOSE_COMMAND` is the one override; never
  hardcode a binary at a call site. Stay on Compose-specification surface —
  `up --wait`, `down`, `config --format json`. `inspect` and Go templates are
  engine-defined and off-limits.
- **Line endings are LF everywhere**, enforced by `.gitattributes`. Do not commit
  CRLF or add editor config that rewrites endings.
- **Do not assume a POSIX path or a specific shell.** Build paths with
  `node:path`; do not rely on `$HOME`, `bash`, or tools like `nvm` being present.

When adding a command that shells out, prefer extending an existing
`scripts/*.mjs` orchestrator over introducing a new shell script.
