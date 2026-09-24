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

## Why

Accepted, because the alternative — moving the repository into `PTV-Mobility`
and asking a package admin for the grant — is a decision about where the project
lives, not about CI. The fallback keeps the workflow identical to the template's
for any repository that does get the grant.

The cost: CI breaks when that person's token expires, is revoked, or loses its
SSO authorisation, and it reads packages with that person's access rather than
the repository's.

## Resolution

Either of:

- Transfer the repository into `PTV-Mobility`, have a package admin add it under
  the package's **Manage Actions access**, then delete the `DS_READ_TOKEN`
  secret. The workflow needs no change; this record moves to the archive.
- Keep the repository where it is and replace the personal token with one owned
  by a machine user, so CI no longer depends on an individual.
