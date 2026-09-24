# 07 — Clean up design versions

**Run by** the design technologist, **on an explicit manual trigger only.**

Deletes design versions that have been superseded, and every trace of them.

---

## The automation rule — read it first

**This prompt never runs automatically.** Not on a schedule, not as a follow-on step from another
prompt, not "while we're here" because a promotion just finished. No other prompt may invoke it, and
it may not offer to clean up versions the operator did not name.

Deleting design history is a judgement call about work a person made. It stays with a person. An
agent that deletes design versions unprompted — even correctly — is the one outcome this prompt is
written to make impossible.

If you arrived here as a suggestion, a "next step", or an inference from another prompt's output:
stop. The only valid entry is an operator explicitly naming versions to delete.

---

## Bindings

The command wrapper that invoked this prompt carries a bindings block. Read it before anything else.

| Binding | This repository |
|---|---|
| `APP_REPO` | `.` |
| `DS_REPO` | `../design-system-uds` |
| `FRONTEND_PACKAGE` | `apps/web` |
| `DS_PACKAGE_NAME` | `@space-hero/design-system` |

## Inputs

| Input | Notes |
|---|---|
| `VERSIONS` | an **explicit list** of design versions to delete. No wildcards, no "everything before X", no "the old ones". |

If `VERSIONS` is empty, a range, or a pattern, stop and ask for an explicit list. "Clean up the
stale versions" is not an input; a named set is.

---

## The rules that do not bend

1. **Manual trigger only** (above). Never automated, never offered, never inferred.
2. **Promoted versions only, demonstrated not assumed** (§1). Eligibility is proven by naming the
   prod version that carries the work, not guessed from age or registry position.
3. **The exact list is confirmed before anything is deleted** (§3). Silence is not consent.
4. **Git history is preserved, and the report says so** (§4). That is what makes deletion
   acceptable and recoverable.

---

## 1. Eligibility check — hard stop on any failure

A design version is deletable **only if it has been promoted into a prod version**. Demonstrate this
for each named version — do not assume it:

- Name the **prod version** that carries this design version's work. A design version is promoted by
  prompt 02 (its screens became a `wired` prod version) and/or prompt 05 (its staged components were
  folded into the shipped design system). The evidence is concrete: the prod entry exists in the
  registry with `kind: "prod"`, and — for a design version whose components were staged — that
  staging folder is already **gone** because promotion deleted it.
- Anything else is **not eligible**: an abandoned experiment, a version never promoted, a version a
  designer is still iterating, a `-tech` revision awaiting review. Report it and stop.

Be conservative in a way that is visible. If eligibility is ambiguous for even one named version,
say so for that version and stop the whole run; do not resolve ambiguity in favour of deleting, and
do not delete the eligible ones while setting the doubtful one aside unless the operator, having seen
the ambiguity, narrows the list.

## 2. Report before deleting

For each eligible version, list **everything** that will be removed, so the operator sees the full
blast radius:

- `FRONTEND_PACKAGE/src/pages/design/vX.Y.Z/` — the version's folder
- its entry in `src/versions/registry.tsx`
- its design-system staging folder and subpath exports **if still present** (usually already gone,
  removed at promotion by prompt 05 — if it is still there, note that promotion left it behind)
- its Storybook stories, if any remain outside the shipped set
- any exported zips still in the tree (`vX.Y.Z-export.zip`, from prompt 04)

Pair each version with the prod version that makes it deletable, from §1.

## 3. Confirm the exact list

Present the list and **wait for explicit confirmation of it**. Not "yes", but confirmation that the
specific set is what the operator means. If the operator adds or removes a version at this point,
re-run §1 eligibility on the new set — a version added here has not been checked.

## 4. Delete and verify

Remove everything listed for the confirmed versions:

- `rm -rf` each `pages/design/vX.Y.Z/` folder
- remove each registry entry (the array element; nothing in `App.tsx` changes)
- remove any lingering staging folder and its four `package.json` subpath exports, and fix the
  aggregate/newest re-export if it pointed at a removed version
- delete any leftover stories and exported zips

Then verify — run it, do not claim it:

```bash
cd APP_REPO
pnpm lint                                 # 0 errors
pnpm --filter <frontend> typecheck        # the app's build does NOT typecheck; this does
pnpm --filter <frontend> build            # the removed chunks are gone and nothing dangles
pnpm --filter <frontend> test:e2e         # routing suite green

cd DS_REPO && pnpm build                  # only if a staging folder was removed — guards must stay green
```

Confirm the **public version is untouched**: it was a prod version, this prompt only removed design
versions, and `PUBLIC_UI_VERSION` is unchanged. Open the public root in a browser if any doubt
remains.

**Git history is preserved.** Deleting a design version removes it from the working tree and the
next build; it does **not** rewrite history. Every deleted version is recoverable from the commit
that removed it. State this in the report — it is what makes the deletion acceptable, and operators
should know the work is not gone.

## 5. Commit

```bash
cd APP_REPO && git add -A && git commit    # removed folders + registry entries
cd DS_REPO  && git add -A && git commit    # only if a staging folder was removed
```

One commit per repo. The magic-word / branch-policy backstop still applies to any push.

---

## Gates

- manual trigger only — no automation, no offer, no inference
- eligibility hard stop — promoted versions only, demonstrated by naming the prod version
- explicit confirmation of the exact list
- full verification after deletion, public version confirmed untouched

---

## Outputs

- the named, confirmed versions removed from the working tree
- a verification report, stating that git history is preserved

## Final report

1. The versions deleted, each paired with the prod version that made it eligible.
2. Anything named but **not** deleted, and why (ineligible / ambiguous).
3. Everything removed per version — folders, registry entries, staging remnants, stories, zips.
4. Verification output — pasted — and the confirmation the public version is untouched.
5. The reminder that git history is preserved and the work is recoverable.
