# `main` has no branch protection

**Created:** 2026-09-22
**Module:** delivery / process

## What

Nothing technically prevents a direct push to `main`. `docs/delivery.md` says to
work on a feature branch, `CLAUDE.md` repeats it, and the design process's
magic-word gate in prompt 01 depends on it — but all three are conventions, and
a convention cannot stop `git push origin main`.

The GitHub API confirms it: `branches/main/protection` returns 404, and the
rulesets endpoint returns

```
Upgrade to GitHub Pro or make this repository public to enable this feature.
```

Branch protection and rulesets are unavailable on a private repository under
this organisation's current GitHub plan. That plan blocks a second, unrelated-
looking thing as well, and the two are one purchase — see
[`github-free-plan-limits.md`](github-free-plan-limits.md), which is where the
plan's costs and the question of who can change it are collected.

One consequence is worth naming here because it is easy to miss: with no rule
requiring review, `CODEOWNERS` enforces nothing. A code owner gets a
notification, not a veto.

## Why

Accepted because the alternatives cost more than the risk here:

- A pre-push hook in `.githooks` is local, opt-in and bypassable with
  `--no-verify`, so it would read as a backstop while being a reminder.
- The observable failure mode — someone pushes to `main` by accident — is
  recoverable: the branch is not deployed from, and a revert is one commit.

The design process names this as host requirement 5 and is written to work
without it: every gate in prompts 01–07 is a stop the operator has to clear, not
a permission the server enforces.

## Resolution

The plan decision in [`github-free-plan-limits.md`](github-free-plan-limits.md),
which is not this record's to make. Once it is made: require a pull request to
`main`, require the `pr-checks` workflow to pass, and block force pushes.
Nothing in the repository changes — this record is deleted and
`design-commands/README.md`'s requirement 5 row flips to **met**.
