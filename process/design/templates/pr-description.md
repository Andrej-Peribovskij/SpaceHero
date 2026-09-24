# Pull request description template

Every handoff in this process is a pull request, and PRs cross role boundaries — a designer's PR
is read by a technologist, a technologist's `-tech` PR is read by a designer. The template exists
so each reader gets what they need first.

---

## App-repo PR — new design version (prompt 01)

```markdown
## design/vX.Y.Z — <short name>

<1–3 sentences: what this version is and what changed>

**Increment:** X | Y | Z — <why>
**Preview:** /design/vX.Y.Z  (administrator account required)
**Design system:** @<pkg>@<version>, staging/vX.Y.Z

### Screens
| Screen | Route | Status |
|---|---|---|
| … | … | new / changed / unchanged |

### Design-system impact
| Component | New / changed | Notes |
|---|---|---|

### Verification
- [ ] lint
- [ ] build
- [ ] ESLint version-prefix rule: 0 violations
- [ ] walked the full flow in a browser
- [ ] designer approved: `APPROVE vX.Y.Z`

### Public app impact
None. Shipped design-system entry unchanged; design routes are lazy and administrator-only.
```

That last section is not boilerplate. It is the claim the reviewer is being asked to accept, and
stating it explicitly means someone has to check it.

---

## DS-repo PR — staging components

```markdown
## staging/vX.Y.Z

### Added
| Component | Purpose |
|---|---|

### Overriding a shipped component
| Component | What differs | Props compatible? |
|---|---|---|

The "props compatible" column is what prompt 05 will hard-stop on at promotion. Fill it honestly.

### Shipped entry
- [ ] src/components/ and src/index.ts unchanged
- [ ] build-artifact diff against <previous version>: clean

### Stories
- [ ] Storybook stories added for every new and changed component
```

---

## App-repo PR — tech revision (prompt 03)

Written **for a designer**. What changed on screen and why, before any implementation detail.

```markdown
## design/vX.Y.Z-tech — refinements from backend integration

### What changed and why
| Screen | Change | What real data revealed |
|---|---|---|

**Preview:** /design/vX.Y.Z-tech  (administrator account required)

### Implementation notes
<technical detail, last — the designer is the primary reader>
```

---

## DS-repo PR — promotion (prompt 05)

Folds a staging version into the shipped design system. The reader is a developer accepting a change
to what the public app renders, so the props diff and the byte-identity acknowledgement lead.

```markdown
## Promote staging/vX.Y.Z → shipped (@<pkg>@<new version>)

**Bump:** minor | major — <the props diff is the reason; if major, "every consumer reviewed">

### Props diff — overrides of shipped components
| Component | What changed | Compatible? |
|---|---|---|
| … | added optional `foo` | yes |

Purely new components (nothing to diff): <list>

### Visual snapshots (shipped stories)
| Story | Before → after | Reviewed |
|---|---|---|
<every diff, human-reviewed; a diff on an untouched component is a leak>

### Shipped entry changed — deliberately
- [ ] this publish changes the shipped entry (that is what promotion does)
- [ ] `ALLOW_SHIPPED_ENTRY_CHANGE=1` set by a human, not the agent
- [ ] staging folder, subpath exports and stories removed; staging guards green
- [ ] public app verified in a browser after repin

### Consumers repinned
| App | → version |
|---|---|
```

The "shipped entry changed" section is the inverse of prompt 01's "public app impact: none". Here the
impact is real and intended, and stating it is what forces someone to confirm a human authorised it.
