# Dependabot opens no npm pull requests

**Created:** 2026-09-22
**Module:** tooling / dependencies

## What

The npm entry in `.github/dependabot.yml` declares a `github-packages`
registry whose token is `${{ secrets.DEPENDABOT_PACKAGES_TOKEN }}`. No such
Dependabot secret is set on this repository, and the effect is not partial: the
npm ecosystem opens nothing at all, public packages included.

Measured on 2026-09-22:

| Ecosystem | `registries:` block | Open pull requests |
| --- | --- | --- |
| npm | yes | 0 |
| nuget | no | 5 |
| github-actions | no | 1 |

`pnpm outdated -r` reported twenty-one workspace packages behind at the same
moment, several of them inside the configured groups (`@testing-library/*`,
`vite`, `vitest`, `typescript`, `@playwright/test`). So the silence is not
"nothing to do", and the token is a precondition rather than a nicety.

The run log itself could not be read to confirm the mechanism: Dependabot job
logs live only in the repository's web UI, there is no REST endpoint for them,
this repository is private, and no browser session was available. The evidence
above is the whole basis for the claim, and it is circumstantial about the
*why* even though it is direct about the *what*.

## Why

The credential is a real precondition, not an oversight in the config. The
design system ships from GitHub Packages, Dependabot cannot use the built-in
`GITHUB_TOKEN` to read it, and it will not resolve a manifest whose
`@ptv-mobility/*` dependencies it cannot reach. Dropping the `registries:`
block to get the public packages moving again is not the way out: the manifests
would still name `@ptv-mobility/*`, and Dependabot would still fail to resolve
them.

### Who can set it — measured on 2026-09-23

The token is postponed deliberately, and this is what the postponement is
about. All of the following came from `gh api`:

- **`DanieleCapuanoPTV` has `maintain` on `PTV-Mobility/scaffolding`, with
  `"admin": false`.** Settings → Secrets and variables → Dependabot requires
  admin, so the page that would hold this secret does not open for him.
- **He is an organisation `member`, not an owner**, so the organisation's
  settings pages are not rendered for him either. The owners are `alecsPTV`,
  `itservice-infrastructure`, `manuelgarciaptv`, `pablojimenezptv`,
  `PTV-DirkJaeger` and `PTV-SeGa`.
- **On `design-system-uds` and `design-system-base` he *is* admin.** That
  asymmetry is why the design-system work felt unblocked while this did not. It
  is a per-repository role, not a property of the account, so "he could do the
  other repositories, therefore he can do this one" does not follow.

### Repository-level is the only shape available

`PTV-Mobility` is on GitHub's Free plan, where an organisation secret can only
be granted to **public** repositories — the Repository access selector does not
offer a private one to choose. `scaffolding` is private, so the
organisation-scoped secret is unavailable outright, not merely unset. That
plan's costs are collected in
[`github-free-plan-limits.md`](github-free-plan-limits.md).

The consequence outlives this repository: **every project started from this
template needs its own copy of the secret**, created by somebody with admin on
that project. "Provision it once for the organisation and every child
inherits" cannot be executed here, so nothing should be written as though it
could.

## Resolution

1. A personal access token with `read:packages` on an account that can read
   `PTV-Mobility` packages. Who owns and rotates it is unassigned, and is the
   same open question `scripts/check-registry-token.mjs` makes a developer
   answer by hand at install time.
2. Somebody with **admin on `PTV-Mobility/scaffolding`** — an organisation
   owner, or whoever can grant that role — adds it as a Dependabot secret named
   `DEPENDABOT_PACKAGES_TOKEN` under Settings → Secrets and variables →
   Dependabot. This is the whole of the deferred work, and it is deferred on a
   permission, not on effort.
3. Confirm on the next Monday run that npm pull requests appear. The table
   above is the before-picture to compare against. Dependabot
   installs with `--ignore-scripts`, which does not skip the `.pnpmfile.cjs`
   registry-token check the way it skipped the old `preinstall` one. The check
   passes when the checkout's `.npmrc` carries a literal credential, which is
   the shape an updater is expected to write; if Dependabot's logs show the
   check refusing instead, that expectation was wrong and
   `scripts/lib/registry-token.mjs` (`projectHasInjectedAuth`) is where to fix
   it.

Then repeat step 2 for every new project started from this template. That
repetition is the cost recorded in `github-free-plan-limits.md`, and it does
not go away until the plan does.

Until then, `pnpm outdated -r` is the manual stand-in, and the comment at the
top of `.github/dependabot.yml` says so rather than promising a degradation
that does not happen.
