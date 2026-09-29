# CI installs the design system with one person's token

**Created:** 2026-09-24
**Module:** CI / `.github/workflows/pr-checks.yml`

## What

This repository lives outside `PTV-Mobility`, the organisation that publishes
`@ptv-mobility/design-system-uds`. The template's CI installs the design system
with the built-in `GITHUB_TOKEN`, which only works once the package grants
Actions access to the consuming repository — and that grant is only offered to
repositories in the same organisation. Here the install failed with
`ERR_PNPM_FETCH_403`.

So the install step now prefers a `DS_READ_TOKEN` repository secret: a
**classic** personal access token with `read:packages`, SSO-authorised for
`PTV-Mobility`, belonging to one developer. When the secret is unset, the step
falls back to `GITHUB_TOKEN` exactly as before.

A run that Dependabot triggers reads Dependabot secrets, not Actions secrets, so
for those the expression above sees no `DS_READ_TOKEN`, falls back to
`GITHUB_TOKEN` and fails the same way. The secret is therefore stored twice:
once as an Actions secret and once as a Dependabot secret
(`gh secret set DS_READ_TOKEN --app dependabot`, added 2026-09-29). The workflow
reads the same name either way and needs no change.

## Why

Accepted, because the alternative — moving the repository into `PTV-Mobility`
and asking a package admin for the grant — is a decision about where the project
lives, not about CI. The fallback keeps the workflow identical to the template's
for any repository that does get the grant.

The cost: CI breaks when that person's token expires, is revoked, or loses its
SSO authorisation, and it reads packages with that person's access rather than
the repository's. With two copies, that failure can hit one kind of run and not
the other: the copies need not hold the same person's token, and rotating one
does not rotate the other. A Dependabot pull request failing with
`ERR_PNPM_FETCH_403` while other pull requests pass means the Dependabot copy is
the stale one.

## Resolution

Either of:

- Transfer the repository into `PTV-Mobility`, have a package admin add it under
  the package's **Manage Actions access**, then delete both `DS_READ_TOKEN`
  secrets, the Actions one and the Dependabot one. The workflow needs no change; this record moves to the archive.
- Keep the repository where it is and replace the personal token with one owned
  by a machine user, so CI no longer depends on an individual. Replace both
  copies.
