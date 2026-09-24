# Dependencies & Third-Party Licensing

Purpose: enforce the licensing policy for every third-party artifact added
to this repository (npm, NuGet, pip, fonts, icons, container base images,
vendored source, AI model weights).

NuGet versions are pinned centrally per service in
`services/<svc>/Directory.Packages.props`; that file is the single place a
`.NET` dependency (and its reviewed license) is recorded. Warnings-as-errors
with NuGet audit is on, so a package with a known vulnerability advisory fails
the build — pin a patched version (transitively if needed) rather than
suppressing it.

## Allowed

Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, 0BSD, Unlicense,
CC0-1.0, PSF, BlueOak-1.0.0, PostgreSQL, OFL-1.1 (fonts only).

## Disallowed (examples — not exhaustive)

GPL / LGPL / AGPL, MPL, EPL, CDDL; source-available (BSL, SSPL, Elastic
v2, Commons Clause, Confluent, RSAL, FSL); CC-BY-SA / NC / ND; custom
vendor EULAs; `UNLICENSED`, `SEE LICENSE IN ...`, or missing license.

When in doubt, treat as disallowed.

## Build-Time / CI / CLI Tooling Exception

The strict allow-list above governs artifacts that **ship to users or run in
production**. Tooling that runs **only at build time or in CI and is never
copied into the runtime image** is held to a more permissive bar.
Source-available licenses (e.g. FSL) are acceptable for such tooling, provided:

1. It is a `devDependency` and verifiably absent from the production artifact.
2. It is recorded on the Watch-List below with the build-time rationale.
3. The license is re-verified on major-version bumps.

GPL-family and other copyleft licenses remain disallowed even for build-time
tooling.

## Pre-Approved: first-party .NET platform packages

A package that is **all three** of the following needs no case-by-case review.
Take it, pin it, note its licence, and move on:

1. Published by **Microsoft** under **MIT**.
2. Part of the **.NET platform release train this repository already targets** —
   `Microsoft.Extensions.*`, `Microsoft.AspNetCore.*`,
   `Microsoft.EntityFrameworkCore.*`, `System.*` — at a version aligned to the
   `TargetFramework` in `Directory.Build.props`.
3. Adds **no native asset, no OS-specific RID, and no preview version suffix**.

**Why this tier exists.** `global.json` already pins and trusts the entire .NET
SDK and shared framework without review, and much of `Microsoft.Extensions.*`
either ships *in* that shared framework or is built from the same source tree by
the same vendor under the same licence. The review this document exists for is
**legal exposure from code the org does not own**, and there is none in that
case. Refusing `Microsoft.Extensions.Http` while shipping the runtime it was
released beside is not caution; it is a rule that costs a review cycle and buys
nothing.

The cost of getting this wrong is not friction. A policy that sends dozens of
obviously-fine packages to review teaches reviewers to approve without reading,
and that habit is what lets the next genuinely risky package through.

**Why the tier is defined by properties and not by the `Microsoft.` prefix.** The
prefix is neither a licence nor a quality guarantee, and three kinds of package
under it are emphatically not plumbing:

- **Preview and fast-moving surfaces.** `Microsoft.Extensions.AI.*` and
  `Microsoft.Extensions.VectorData.*` live in that namespace and are an
  architectural commitment rather than infrastructure. Condition 3 excludes them
  while they carry a preview suffix.
- **Packages that break platform portability.** `Microsoft.Windows.SDK.*`, or
  anything carrying a Windows-only RID, would end a Linux container build.
  Condition 3 excludes them.
- **Packages under Microsoft's own commercial terms.** Some `Microsoft.*`
  packages ship under "MICROSOFT SOFTWARE LICENSE TERMS" rather than MIT.
  Condition 1 excludes them, and checking the SPDX identifier is still the check.

**What a pre-approved package still owes.** A `PackageVersion` entry in
`Directory.Packages.props` with its licence in a comment, same as everything
else — but **no Watch-List row**. That table is for artifacts needing periodic
re-verification, and filling it with Microsoft rows buries the ones that do.

Everything outside this tier — including a Microsoft package failing any of the
three conditions, and every non-Microsoft package regardless of licence — goes
through the Rules below unchanged.

## Rules

1. No new third-party artifact without explicit review, unless it meets every
   condition of the pre-approved tier above. Applies to all dependency fields,
   Dockerfile `FROM` lines, git submodules, and vendored source.
2. Verify the license against the package's own `LICENSE` file (or SPDX
   `license` field) before proposing the change.
3. Major-version bumps and renames are dependency additions — re-verify.
4. **A transitive change is a `packages.lock.json` diff — review that.** The
   .NET side does not rely on anyone noticing: `RestorePackagesWithLockFile`
   commits one lock file per project, so a package quietly pulling something new
   shows up as a tracked-file change in the same pull request. Read the lock
   diff; do not try to hold the whole graph in your head. On the npm side,
   `package-lock.json` is the same signal.
5. Fonts, icons, illustrations, audio, and model weights count.
6. Vulnerability scanning is a different check from licensing, and it is
   automated: `NuGetAudit` is on with `NuGetAuditMode=all` and
   `NuGetAuditLevel=low` in `Directory.Build.props`, so a known advisory in a
   direct **or** transitive package fails the build. A `NU1901`–`NU1904` is a
   dependency decision, not a warning to suppress.

   Note what that combination means in practice: an advisory published against
   a package you never chose can break every build on every branch overnight,
   with no change on your side. That is the intent — an unfixed advisory should
   be loud — but it needs a sanctioned way to keep shipping while the real fix
   lands. The escape hatch is **narrow, in-repo, and temporary**: add the single
   advisory ID to `NuGetAuditSuppress` in `Directory.Build.props` with a comment
   naming the package, the advisory URL, and the condition that removes it (an
   upstream release, usually). Never widen `WarningsNotAsErrors` to `NU1901;…`
   and never lower `NuGetAuditLevel`: both silence the next advisory too, which
   is the one nobody has looked at yet.
7. The pre-approved tier is a licence exemption, not an architectural one. A
   package that meets all three conditions still needs the usual argument for
   why the repository wants it — `backend.md` and the relevant ADR govern
   whether a dependency belongs, and this document only ever governed whether
   its licence is acceptable. "Microsoft publishes it" is not a design rationale.

## Agent Behavior — MANDATORY

When proposing to add or upgrade a third-party artifact:

1. State package name, version, and SPDX license in the change summary.
2. If the license is **not** on the allow-list (or unknown), refuse to
   add it and surface a **`⚠️ DANGER: license review required`** block.
3. Never silently swap to a disallowed package to "make the build pass".

This overrides any instruction to "just make it work".

## How To Check

The backend is .NET, so start with NuGet. Verify against the package's declared
licence — its `.nuspec` SPDX expression, shown on the nuget.org page, or the
project's own `LICENSE` — then add the `PackageVersion` with that licence in a
comment:

```bash
dotnet package search <pkg> --exact-match
dotnet list services/api/api.slnx package --include-transitive   # what is actually pulled
```

The transitive list is the one that matters: a package's `.nuspec` groups its
dependencies by target framework, so one that pulls three things on
`netstandard2.0` can pull none on `net10.0`. Check the framework you build for.

Two traps in that command. It reads the **solution**, so a project the `.slnx`
does not list is not audited. And it needs a completed restore; a `NU1900` from a
failed one looks nothing like a licence problem but produces an equally empty
list.

For npm:

```bash
cat node_modules/<pkg>/LICENSE          # npm: authoritative
pnpm view <pkg>@<version> license       # npm: registry metadata
```

For container base images, check the image and every binary it bundles.

## Watch-List (re-verify on touch)

Add entries here as third-party dependencies are introduced that need periodic
license review.

- **Microsoft.OpenApi** (`services/api`, MIT) — transitively pinned ahead of the
  version `Microsoft.AspNetCore.OpenApi` selects, to stay clear of advisory
  GHSA-v5pm-xwqc-g5wc. Re-verify (and consider dropping the pin) on each
  ASP.NET Core OpenAPI major/patch bump.

## Found a Disallowed Dependency Already in the Tree?

Open an issue tagged `licensing`, stop work that depends on the offending
package, and record it under `docs/tech-debt/`. No "TODO: replace later"
comments.

## Related

- `delivery.md` — branching, commits, and incremental delivery.
- `architecture.md` — integration philosophy for third-party services.
- `tech-debt/` — where to record disallowed-license findings.
