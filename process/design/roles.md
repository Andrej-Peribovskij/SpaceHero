# Roles

Three roles. Each owns a distinct decision, and the handoffs between them are pull requests.

---

## Designer

**Owns** the design language, the design tool, and the content of design versions.

**Decides**
- whether a new version is an X, Y or Z increment
- when a design version is good enough to leave their machine (the magic-word gate)
- whether a technologist's `-tech` revision is acceptable, or needs another design pass

**Runs**
- `01-create-design-version` — turn a design-tool export into `design/vX.Y.Z` plus the matching
  design-system staging area
- `04-preview-and-export` — review a `-tech` revision live, and export a readable source tree
  back into the design tool

**What a designer needs running follows the version, not the role.** Both prompts read the `wired`
field on the version's registry entry and pick the runtime from it. A `wired: true` version — which
a `-tech` revision from prompt 03 is — talks to real backends and needs `FULL_STACK_CMD`, every
time. A `wired: false` version — everything prompt 01 creates — is mocked by construction, so what
it still needs is not a backend but an **administrator session**, because `/design/*` is
administrator-only. `design-commands/README.md`'s optional requirement 6 is the seam that supplies that session
without an auth backend, and sets `DESIGN_PREVIEW_CMD`. It is absent here, so the binding is
empty and designers run `FULL_STACK_CMD` exactly as before. `FRONTEND_ONLY_CMD` is
never the answer on its own: it starts the server and seeds nothing, so the designer is redirected
to the public app — which looks exactly like the version being broken and is not.

This paragraph used to say a working backend was a flat precondition of both prompts, because the
frontend alone returned an "internal server error". Measured on the reference implementation,
2026-09-16, it does not; both prompts were corrected and this was not. The correction is narrower
than its opposite, and worth stating precisely: the missing piece was the *session*, not the
backend.

**Does not**
- wire anything to a backend
- decide what becomes public
- promote staging components into the shipped design system
- answer technical questions — a designer is never asked which library or version to depend on,
  whether a package or an environment resource is available, or what architecture to use. Those are
  resolved by studying the canonical public version (see prompt 01 §1.1), not by asking. The only
  things a designer decides in a run are above; the only doubts that reach them are design-content
  ones (an icon *concept* the registry lacks, a cross-version link that was not in the design).

---

## Design technologist

**Owns** backend integration, promotion, and what real users see.

**Decides**
- whether a design version is ready to become a real, wired version
- how backend gaps are resolved: build the endpoint, stub it, or leave the screen mocked
- when staging components are promoted into the shipped design system
- when `PUBLIC_UI_VERSION` moves — never automatic, always an explicit act
- when superseded design versions are deleted — also never automatic

**Runs**
- `02-wire-version-to-backend` — promote a design version into a real prod version
- `03-tech-revision` — push UX refinements back to the designer as `design/vX.Y.Z-tech`
- `05-promote-ds-staging` — fold staging components into the shipped design system
- `06-promote-public-version` — flip `PUBLIC_UI_VERSION`
- `07-clean-design-versions` — delete promoted design versions

**Does not**
- change the design language unilaterally — refinements go back to the designer as a `-tech`
  version and a pull request, not straight into a public version

---

## Developer

**Owns** the application and design-system codebases, and the conventions themselves.

**Decides**
- the architecture the prompts assume: the version registry, the access gate, the staging
  mechanism
- whether a pull request from either other role is sound

**Runs**
- no prompt in the normal loop. Developers review, and they maintain this repository.

---

## Handoffs

| From | To | Vehicle | Gate |
|---|---|---|---|
| Designer | Technologist | PRs in the app and DS repos | magic word `APPROVE vX.Y.Z` before any push |
| Technologist | Designer | PR carrying `design/vX.Y.Z-tech` | designer review in the browser |
| Either | Developer | the same PRs | conventions honoured, CI green |

Every handoff is a pull request. No role writes directly to a default branch — the branch policy
enforces it, and the magic word is the human checkpoint that comes first.

---

## A note on the magic word

Prompt 01 must not push anything until the designer replies with the exact token
`APPROVE vX.Y.Z`, including the version. It is version-scoped on purpose: a generic word could be
replayed from an earlier cycle and approve work nobody looked at.

This is a **convention**. An agent cannot be technically prevented from pushing. The branch
policy blocking direct pushes to the default branch is the actual safety net; the magic word is
what stops half-finished work from reaching a pull request in the first place.
