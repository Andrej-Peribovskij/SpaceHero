# The GitHub plan blocks two things, and it is one decision

**Created:** 2026-09-23
**Module:** organisation / GitHub plan

## What

`PTV-Mobility` is on GitHub's **Free** plan. Two records in this directory
describe what that costs, and because they describe it from the affected
feature's side they read as two independent problems. They are one purchase.

| Free-plan limit | What it costs this repository | Record |
| --- | --- | --- |
| Branch protection and rulesets are unavailable on a private repository | Nothing technically stops a direct push to `main`. The design process's host requirement 5 in [`design-commands/README.md`](../../design-commands/README.md) cannot be met, and `CODEOWNERS` enforces nothing — with no rule requiring review, a code owner is a notification | [`no-branch-protection-on-main.md`](no-branch-protection-on-main.md) |
| An organisation secret can only be granted to **public** repositories | `DEPENDABOT_PACKAGES_TOKEN` cannot be provisioned once for the organisation. Every project started from this template needs its own copy, set by somebody with admin on that repository | [`no-dependabot-npm-updates.md`](no-dependabot-npm-updates.md) |

Measured on 2026-09-23 with `gh api`. The rulesets endpoint says it outright —
*Upgrade to GitHub Pro or make this repository public to enable this feature* —
and an organisation secret's **Repository access** selector does not offer a
private repository to choose, so there is nothing to misconfigure: the
organisation-scoped shape does not exist here.

The second row is a scaling cost, not today's blocker. A **repository**-level
Dependabot secret is available on every plan, including this one; what stops it
on `scaffolding` is a permission, not the plan, and that belongs to the other
record.

## Why

Accepted, because neither alternative is a trade anybody would make for these
two features:

- Making the repositories public to unlock them is not a decision about branch
  rules or secrets.
- Per-repository copies of the Dependabot secret do work. They just have to be
  created, and remembered, once per project — which is a cost that arrives
  later and gradually, and so is exactly the kind that goes unnoticed.

It is also not a decision anybody currently working in this repository can
make. `DanieleCapuanoPTV` is an organisation **member**, not an owner, so the
organisation's settings pages are not rendered for him at all. The owners are
`alecsPTV`, `itservice-infrastructure`, `manuelgarciaptv`, `pablojimenezptv`,
`PTV-DirkJaeger` and `PTV-SeGa`.

## Resolution

A paid plan on `PTV-Mobility`, or the repositories becoming public — decided by
an organisation owner, since nobody else can see the page that changes it. The
cost is per seat per month and this repository is not the only thing on the
plan, so the question is an organisation's, not a project's.

What changes when it does:

- Branch protection on `main` becomes configurable. That record is deleted and
  requirement 5 in `design-commands/README.md` flips to **met**.
- An organisation-scoped `DEPENDABOT_PACKAGES_TOKEN` becomes possible, so a new
  project started from the template inherits it instead of needing its own. The
  other record's *permission* problem is untouched by this — somebody still has
  to hold the access that sets a secret.

Nothing in this repository changes either way. This record exists so that the
two above are read as one question by whoever is in a position to answer it.
