# Design System Guide

Purpose: how this repository consumes a design system, and what to do when it
does not have what you need.

For app-level frontend rules, see `frontend.apps.md`.

## Quick Scan

- The design system is **not in this repository**. It is an npm package with its
  own repository, release cadence, tokens, Storybook and visual baselines.
- `apps/web` depends on it under a stable local alias, `@my-app/design-system`,
  so swapping which design system a project uses is one line in
  `apps/web/package.json`.
- It is served by **GitHub Packages**, which authenticates reads as well as
  writes. Every install needs a token — yours, CI's and the image build's.
- A missing component is a conversation with the design system's owners, not a
  local re-implementation. Record the gap; do not hand-roll the primitive.
- A `.pnpmfile.cjs` hook (`preResolution` → `scripts/check-registry-token.mjs`)
  refuses an install that has no usable credential, before anything is
  fetched, and names the file, the line and what is wrong with it — so the
  failure names its cause instead of arriving as an unexplained 401.
  `SCAFFOLD_SKIP_TOKEN_CHECK=1` skips it.
- Which design system `apps/web` points at is one line, and `pnpm run init`
  writes it. The two this organisation publishes do **not** share their
  component props — see `tech-debt/design-systems-share-no-component-api.md`
  before assuming a switch is free.
- Which components this app ships itself **on purpose** is a committed list:
  `design-local-components.md`. Everything else it ships itself is a gap.
- Staging a component, promoting it and republishing is prompt 05's job, not a
  hand operation: `design-staging.md` and `process/design/`.

## Where it comes from

| | |
|---|---|
| Package | `@ptv-mobility/design-system-uds` |
| Repository | [PTV-Mobility/design-system-uds](https://github.com/PTV-Mobility/design-system-uds) |
| Registry | `https://npm.pkg.github.com` |
| Alias in this repo | `@my-app/design-system` |

The alias is the point. Application code imports `@my-app/design-system` and
never the package name, so the dependency line is the single place that records
*which* design system this project uses and *which version* it is pinned to:

```json
"@my-app/design-system": "npm:@ptv-mobility/design-system-uds@^0.6.1"
```

Switching to a different design system — `@ptv-mobility/design-system-base`, or
one that does not exist yet — changes that line and nothing else.

## Getting a token

GitHub Packages requires authentication for reads, including for public
packages, so `pnpm install` fails with a 401 without one.

pnpm deliberately ignores an auth setting that comes from a project `.npmrc`,
and expands no environment variable in one, because that file is committed and a
`${TOKEN}` in it could be pointed at an attacker-controlled registry. The
credential has to live in a **user-level** file. The repository's own `.npmrc`
carries only the scope-to-registry routing.

1. Create a **classic** personal access token with the `read:packages` scope.
   GitHub Packages' npm registry does not accept fine-grained tokens
   (`github_pat_…`): the token is sent and the install fails with a **403**,
   not a 401, so it looks like missing access rather than the wrong kind of
   token. A classic token starts with `ghp_`. If the organisation enforces
   SAML SSO, also authorise the token for it (**Configure SSO** beside the
   token), or that too answers 403.
2. Add one line to your own `~/.npmrc` (not this repository's), **on a line of
   its own**:

   ```
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

   If the file already exists, make sure it **ends with a newline before you
   append to it**. Appending with `>>` or `Add-Content` to a file whose last
   line has no newline glues the token onto the end of that line — usually a
   comment — where npm reads it as part of the comment: the file visibly holds
   the token and the install still fails with a 401. In Windows PowerShell 5.1,
   `>>` also writes UTF-16, which npm cannot read at all. Editing the file in an
   editor and saving it as UTF-8 avoids both.

3. Export the token in your shell profile:

   ```bash
   export NODE_AUTH_TOKEN=<token>          # PowerShell: $env:NODE_AUTH_TOKEN = "<token>"
   ```

Putting the token itself in `~/.npmrc` works too; the indirection just keeps the
secret out of a file that backup tools and dotfile repositories tend to collect.

CI needs none of this. `actions/setup-node` writes that same line to a
user-level file, and the install step passes the repository's built-in
`GITHUB_TOKEN` as `NODE_AUTH_TOKEN` — which works because the package grants
Actions access to this repository. That grant is a manual step in the package's
settings, once per consuming repository; there is no API for it.

`pnpm run image:web` passes `$NODE_AUTH_TOKEN` to the build as a BuildKit
secret. It is never a build argument and never lands in a layer. On Windows that
build currently fails in podman's client before it starts — see
`tech-debt/web-image-build-secret-on-windows.md` for the one-command workaround.

**Dependabot needs a third copy, and it is not yours.** Dependabot runs with its
own secret store, separate from your `~/.npmrc` and from Actions' secrets, so
nothing above reaches it. Without a Dependabot secret named
`DEPENDABOT_PACKAGES_TOKEN` it opens no npm pull requests at all — not even for
packages on the public registry — and it does so silently. Setting it needs
admin on the repository, so it is not a step the person running the install can
take; on this organisation's plan it also cannot be set once for every project,
which means a repository started from this template needs its own.
`tech-debt/no-dependabot-npm-updates.md` has the measurements and who to ask.

## What the install check reports

`pnpm install` runs `scripts/check-registry-token.mjs` from `.pnpmfile.cjs`'s
`preResolution` hook. It is not a `preinstall` script because that runs too
late: measured on pnpm 11.20 with a frozen lockfile and a cold store, the root
`preinstall` runs only after every package has been fetched, so on a new
machine the raw `ERR_PNPM_FETCH_401` arrived first and the check never spoke.
`preResolution` runs after the lockfile is read and before any fetch, and it
runs under `--ignore-scripts` too.

It reads the user-level file (`NPM_CONFIG_USERCONFIG`, else `~/.npmrc`) and
names exactly one of:

| What it finds | What it says |
|---|---|
| no file, or no line for `npm.pkg.github.com` | the line to add, and that the file must end with a newline first |
| the token glued to the end of another line | the line number, and that the token needs a line of its own |
| the line commented out, or with an empty value | the line number |
| `${VAR}` with `VAR` unset in this shell | the line number and the variable's name |
| a UTF-16 file | that npm cannot read it, and to re-save it as UTF-8 |

It prints a path, a line number and a variable name — never a line's content,
and never a token. It passes without reading the user file when the checkout's
own `.npmrc` has had a literal credential written into it by a tool (the
committed one never has). `SCAFFOLD_SKIP_TOKEN_CHECK=1` skips it entirely.

**The cost:** pnpm records the pnpmfile's checksum in `pnpm-lock.yaml`
(`pnpmfileChecksum`), so every edit to `.pnpmfile.cjs` is a lockfile change too
— run `pnpm install` after one, or a frozen install refuses. Keep that file
small; the logic lives in `scripts/lib/registry-token.mjs`, which the checksum
does not cover. `apps/web/Dockerfile` copies all three files in with the
manifests.

## Consuming it

Import from the alias, never from a path inside the package:

```tsx
// Correct
import { Button, Card, DataTable } from "@my-app/design-system";

// Wrong — the file layout is not the contract
import { Button } from "@my-app/design-system/dist/components/Button";
```

`apps/web/src/styles/globals.css` imports the design system's built stylesheet,
which carries its tokens and component styles. Reference semantic tokens through
Tailwind's arbitrary-value syntax (`bg-[var(--color-...)]`) or the utilities
generated from its `@theme`. Never hardcode a hex colour, a pixel size, ad-hoc
spacing or a non-token font value in app code.

`WidgetsView` uses the design system's `Button` for its retry control. That is
the template's only consumer of the package, and it is deliberate: it is what
makes a broken or unreachable design system a failed build rather than a
surprise in the browser.

## When something is missing

The design system is a different repository with different reviewers, so
extending it is no longer something a feature branch does in passing.

1. Check the package's staging export first — `@my-app/design-system/staging`
   holds components that exist but have not been promoted.
2. If it genuinely is not there, open the conversation with the design system's
   owners. A component that several products need belongs there, not in one app.
3. If the product cannot wait, build it locally **and** record a tech-debt entry
   in `docs/tech-debt/` naming the component and what should replace it. An
   undocumented local primitive is how a design system quietly stops being one.

## Upgrading

`pnpm outdated` reports a newer version against the range in
`apps/web/package.json`; the design system's `CHANGELOG.md` says what changed.
Bump the range, install, and run `pnpm run verify` — its `typecheck` step is
`tsc --noEmit` in every package, so a breaking type change in the design system
is a failed gate rather than a warning. Do not reach for `pnpm run lint` alone
for this: `lint` is ESLint and sees no types.
