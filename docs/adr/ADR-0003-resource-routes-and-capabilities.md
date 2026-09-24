# ADR-0003: Resource-oriented routes and capability-based authorization

**Status:** Accepted

## Context

An API serving several kinds of user has to answer two questions: what may this
caller do, and how does the answer stay legible as the product grows. There are
two common shapes.

**Persona-prefixed routes.** Every authenticated endpoint sits under
`/api/v1/{admin|user|public}/…`, each with a single-role guard and its own
controller and DTOs, even when the behaviour is currently identical. The
permission model is legible from the URL, and each persona's contract can evolve
independently.

The cost compounds. Every resource is implemented two or three times, so a fix
lands two or three times or is forgotten in one place. A caller holding two
personas hits two route trees for the same resource. The OpenAPI document grows
a path per persona per resource, and the generated client with it. And the model
answers "which prefix did this arrive on", which is not the same question as
"may this caller do this" — the moment one endpoint should be available to two
personas under different conditions, the prefix stops carrying the answer.

**Resource routes with capability checks.** One path per resource, and what a
caller may do is a capability on their token, checked where the rule lives.

## Decision

**Routes are resource-oriented.** Every endpoint is `/api/v1/<resource>`; there
are no persona prefixes and no per-persona controllers or DTOs. Authentication
is required at the edge; unauthenticated endpoints (login, health, deliberately
public reads) are the explicit exceptions.

**Authorization is capability-based.** A JWT carries the actor's capabilities (or
carries roles that the authentication layer expands into capabilities). The edge
translates the token into the framework-neutral `IActorContext` — subject id plus
a capability set — and the Application use case checks the capability it needs and
then enforces resource/owner scope. Application code never sees roles, personas,
ASP.NET, or JWT types.

**Roles stay in the identity model as data, not as routing.** An identity module
stores a set of roles and maps each to the capabilities it grants when it issues
a token. Adding a capability to a role is a data/mapping change, not a new
controller tree.

**Rules that separate duties stay domain invariants.** "An approval must not be
recorded by the actor who submitted it" is enforced in the domain, not by having
submit and approve live under different prefixes. A distinct capability gates who
may approve at all; the domain gates that it is not the submitter.

**The frontend uses canonical resource paths** and gates UI affordances on the
session's capabilities rather than on a persona prefix. There is no per-call
prefix to prepend.

## Consequences

Easier:

- One endpoint surface per resource. A fix lands once.
- "What may this actor do" is one explicit set on the token, checkable in one
  line in the use case, instead of being implied by which prefix a request
  arrived on.
- New audiences or finer permissions are new capabilities and role→capability
  mappings, not new route trees and DTO sets.
- The OpenAPI document has one path per resource; the generated client is
  correspondingly simpler.

Harder:

- Response shaping that per-persona DTOs would do by construction is now done
  inside the use case or endpoint based on capabilities (a field returned only to
  an actor holding `<resource>.read.any`). The divergence lives in code and tests
  rather than in the folder structure, so it needs a test to be visible.
- Audience intent is no longer legible from a URL prefix; it is read from the
  capability a handler requires. Endpoint tags and capability names carry that
  meaning instead.
