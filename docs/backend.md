# Backend Guide

Purpose: define the durable backend implementation rules for `services/api`, a
self-contained C#/.NET service. Node orchestrates the repo; the backend runs
through `pnpm run …` (which delegates to `dotnet`).

## Quick Scan

- Layering is `Infrastructure -> Application -> Domain`, one project per layer.
- `Domain` and `Application` reference no framework (no ASP.NET, no EF Core).
- Cross-module calls go only through a module's `Contracts` project.
- Business behavior is modeled in domain language; vendor concepts stay in
  adapters (Infrastructure).
- PostgreSQL and EF Core migrations are mandatory; in-memory persistence is not.
- API routes are resource-oriented (`/api/v1/<resource>`), never persona-scoped.
- Backend changes update the OpenAPI snapshot and tests in the same change.
- No new NuGet dependency without explicit review and an Apache-2.0-compatible
  license. Versions are pinned in `Directory.Packages.props`. See
  `dependencies.md`.

## Stack and Runtime

- Language / runtime: C# on .NET 10 (SDK pinned in `services/api/global.json`)
- Web framework: ASP.NET Core (minimal APIs)
- Database: PostgreSQL via EF Core + the Npgsql provider
- OpenAPI snapshot: `packages/schemas/openapi/api-v1.json`

The service is self-contained: its solution (`api.slnx`), `Directory.*.props`,
`global.json`, and `.config/dotnet-tools.json` live under `services/api`. There
are no .NET files at the repo root.

`Directory.Build.props` is where the strictness lives, and it is worth knowing
what it actually sets rather than trusting a summary:

| Property | Effect |
|---|---|
| `TreatWarningsAsErrors` | Any warning fails the build, analyzer and NuGet-audit warnings included. This is what makes everything below bite. |
| `Nullable` / `ImplicitUsings` | Both `enable`. |
| `AnalysisLevel=latest-recommended` | The .NET analyzer set at the current SDK's recommended severities. |
| `EnforceCodeStyleInBuild` | Style rules (`IDE*`) run at build, configured in `.editorconfig` — naming excepted, see below. |
| `ManagePackageVersionsCentrally` | No `Version` on a `PackageReference`; versions live in `Directory.Packages.props`. |
| `RestorePackagesWithLockFile` | One committed `packages.lock.json` per project. |
| `NuGetAudit` / `NuGetAuditMode=all` / `NuGetAuditLevel=low` | A known advisory in a direct or transitive package fails the build. |
| `NoWarn` | Every entry carries its reason inline. Add nothing here without one. |

**`.editorconfig`** at the repository root configures the style rules
`EnforceCodeStyleInBuild` runs, and it is the file to edit rather than reaching
for a suppression. Without content there it enforces default severities, and most
`IDE` rules default to suggestion or silent — so the build flag looks like a style
gate while enforcing nothing. Formatting is the lint gate: `pnpm run backend:lint`
runs `dotnet format` in verify mode and fails on anything the formatter would
rewrite; `pnpm run backend:format` fixes it in place.

**Naming rules are the lint gate's, not the build's.** `EnforceCodeStyleInBuild`
does not run `IDE1006`, so a `public int probeLower()` compiles with zero
warnings and then fails `pnpm run backend:lint`. The naming section of
`.editorconfig` is therefore enforced exactly like `IDE0005` below, not like
`IDE0011` — which does fail the build. Do not read a green `dotnet build` as a
naming check.

**`.slnx`** is the XML solution format that replaced `.sln`. It lists projects
explicitly, so a project added under `src/` and left out of the `.slnx` still
builds through a transitive `ProjectReference` while being invisible to every
solution-wide command, `dotnet list package` included. Add new projects to it in
the same change.

**`dotnet ef` is a local tool**, pinned in
`services/api/.config/dotnet-tools.json` rather than installed globally.
`scripts/backend.mjs` runs `dotnet tool restore` for you; calling `dotnet ef` by
hand needs it first.

Common commands (from the repo root):

- `pnpm run backend:build` / `backend:test` / `backend:lint` (`dotnet format`)
- `pnpm run db:migrate` / `db:seed`
- `pnpm run openapi:sync` / `openapi:check`

## C# Conventions

Write these down and keep them written down. They are cheap to state and
expensive to discover: a convention held only by reviewers is one every new
contributor and every language model gets wrong on the first attempt, and one
that contradicts Microsoft's published guidance — there is one below — gets wrong
every time.

### Async methods carry no `Async` suffix, except where a framework demands one

`Handle`, `Add`, `Find`, `Save` — not `HandleAsync`, `AddAsync`.

This **departs from the Framework Design Guidelines**, so here is the argument
rather than the preference. The suffix exists to distinguish a member from its
synchronous twin, which is why the BCL has both `Stream.Read` and
`Stream.ReadAsync`. Application code here has no twins: a port is asynchronous
because it crosses a process boundary, and no synchronous overload exists or can
be added without a blocking call. Where there is no ambiguity, the suffix
restates the return type, which is already in the signature.

**The exception is a name a framework chooses, not you.** ASP.NET Core requires
`InvokeAsync` on middleware, `TryHandleAsync` on an `IExceptionHandler` and
`CheckHealthAsync` on an `IHealthCheck`; those keep their names, as do BCL and EF
Core calls (`ToListAsync`, `SaveChangesAsync`). The rule governs members this
repository names.

If a project prefers the guideline's convention instead, that is a fine choice —
**make it and record it here.** The failure mode is neither convention but both
at once, which is where this template started: of eleven async methods five
carried the suffix, and only three of those five — `TryHandleAsync`,
`InvokeAsync`, `CheckHealthAsync` — were names a framework mandated. The other
two were the repository's own (`ISeeder.SeedAsync`, `DatabaseSeeding.RunAsync`)
and are now `Seed` and `Run`. Nothing enforces this rule mechanically, so the
example a contributor copies is the enforcement: leave no repo-owned `Async` in
the tree.

### Cancellation

Every method that awaits takes a `CancellationToken` and **passes it on**. Last
parameter, named in full, `= default` on a port or repository interface.

Passing it on is the part that matters: a token that stops at the Application
layer and never reaches `ToListAsync` or `SendAsync` is the same bug as not
taking one.

### Types

- **`sealed` by default.** Inheritance is opened deliberately or not at all.
- **`record` for values** — HTTP DTOs, commands, query results, value objects.
  `class` for entities, which have identity and change through named methods.
- **`internal` unless something outside the assembly needs it.** A `Contracts`
  type is public because that is its job; an EF configuration or an endpoint
  class is not.
- **File-scoped namespaces.** EF-generated migration designers are the exception
  and are excluded in `.editorconfig`.
- **Nullable is on**, and the null-forgiving `!` is a last resort: it should
  follow a checked pattern in the same expression rather than assert something a
  reviewer has to take on trust.

### Dependency injection

- **`AddScoped` is the default** for anything touching `AppDbContext` — every
  handler, every repository. `AddSingleton` is for stateless adapters.
- **A singleton must not capture a scoped service.** Where one genuinely needs
  it, inject `IServiceScopeFactory` and open a scope per unit of work. A
  `DbContext` shared across that boundary enlists the caller's transaction in
  work that is not the caller's.
- **A module registers its own services in `Add<Name>Module`**, and nothing
  registers on its behalf.

### Configuration reaches services as `IOptions<T>`

Bind a section once, validate it at startup, inject the result:

```csharp
services.AddOptions<JwtOptions>()
    .Bind(configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

Read `IConfiguration` directly only in bootstrap paths that run before the
options system is useful — the connection string, a telemetry endpoint. **A
service that reads `IConfiguration["Some:Key"]` in a DI lambda has bypassed
whatever validation that section carries**, and the two readings then drift
silently, because nothing links them.

Give numeric and date settings a numeric or `TimeSpan` property and let the
binder convert them. The binder is culture-invariant; a hand-written
`double.TryParse` over a configuration string is not, and reads `"30.5"` as
`305` on a German host.

### Time

**Inject `System.TimeProvider`.** Never read `DateTimeOffset.UtcNow` in a
handler, an entity or an adapter, and never use `DateTime.Now`. Timestamps are
UTC `DateTimeOffset` end to end.

```csharp
public sealed class CreateWidgetHandler(
    IWidgetRepository repository,
    TimeProvider timeProvider)
{
    // ... timeProvider.GetUtcNow() ...
}
```

Registered once in `Program.cs` as `services.AddSingleton(TimeProvider.System)`.

`TimeProvider` is the platform's own abstraction for this and has been since
.NET 8, which is why this template uses it rather than declaring an interface of
its own. **Do not hand-roll an `IClock`.** A two-member interface looks like less
than a framework type and is more: it is a second abstraction over the same
concept that every consumer, every test double and every future contributor has
to learn, and it cannot do the two things that matter most.

- **Faking is already solved.** `FakeTimeProvider`
  (`Microsoft.Extensions.TimeProvider.Testing`, pinned here, and admitted by the
  pre-approved tier in `dependencies.md` without a licence review) advances on
  demand. A hand-rolled clock means a hand-rolled double per test file, which is
  how a codebase ends up with a dozen of them.
- **Timers are virtualised.** `TimeProvider.CreateTimer` and the delay helpers
  are part of the abstraction, so anything built on a periodic timer — a poller,
  a debounce, a retry — is testable without waiting in real time. An interface
  exposing only `UtcNow` leaves that code untestable, and that is usually the
  code most worth testing.

This template previously shipped an `IClock` in `BuildingBlocks`. It was removed
rather than deprecated: a template's default is the thing every repository built
from it inherits, and leaving a duplicate abstraction in place means every one of
them pays for the migration later.

### Analyzer suppressions

`TreatWarningsAsErrors` is on, so a suppression is a decision. Suppress at the
**smallest scope that works** — a `#pragma` around the statement, never the
project — and put the reason on the same line:

```csharp
#pragma warning disable CA1031 // Logged and swallowed; the next tick is the retry.
```

A rule that needs suppressing repeatedly belongs in `NoWarn` in
`Directory.Build.props`, **with the same written reason**.

## Boundaries and Module Shape

A module is a bounded context, composed of one project per layer:

```
services/api/src/
  Host/            Composition root (Program.cs): auth, errors, OpenAPI, health
  BuildingBlocks/  Framework-neutral primitives (ids, actor, errors; the clock is TimeProvider)
  Persistence/     AppDbContext, conventions, migrations, seeding
  Modules/<Name>/
    Domain/          Entities, value objects, domain rules — references only BuildingBlocks
    Application/     Use cases, ports, capability constants — no framework
    Contracts/       The module's ONLY cross-module surface (the public/* analog)
    Infrastructure/  EF config, repositories, HTTP endpoints, DTOs, module wiring
```

Rules (enforced by architecture tests, not just convention):

- `Domain`, `Application`, and `Contracts` reference no ASP.NET Core, EF Core, or
  Npgsql. Boundaries fail at compile/test time, not review time.
- Another module may depend only on a module's `Contracts` project.
- Endpoints and repositories live in `Infrastructure`; business rules do not.
- The `Host` composes modules via each module's `Add<Name>Module` /
  `Map<Name>Module` surface; nothing else knows a module's internals.
- Prefer explicit, boring code. Use plain functions for small pure helpers.

## Domain and Data Modeling

- Use cases orchestrate; the domain owns invariants and state transitions.
- Prefer rich entities and value objects over primitives when invariants exist
  (e.g. `WidgetName.Create` validates and throws `AppException`).
- HTTP DTOs are transport contracts only; endpoints never return domain types.
- Domain and Application raise framework-neutral failures: `AppException(kind,
  code, message)` with a stable, app-owned error code.
- State changes happen through named methods on the entity; pass `DateTimeOffset
  now` in so behavior stays testable without fake timers.

Entity conventions:

- Application-generated IDs are UUID v7 (`IIdGenerator` / `Guid.CreateVersion7`).
- New entities include `CreatedAt`, `UpdatedAt`, and (for soft delete)
  `DeletedAt`, where `NULL` means active (an EF global query filter hides
  deleted rows).
- Timestamps are `DateTimeOffset` in UTC and map to PostgreSQL `timestamptz`.
- Table names are `{module}_{table}` (e.g. `example_widgets`), set explicitly in
  the entity configuration; columns are normalized to `snake_case` by the shared
  convention in `Persistence/ModelConventions.cs`.

## Persistence

- PostgreSQL is mandatory; in-memory repositories are prohibited in production.
- Each service owns one `AppDbContext` and one migration stream. It declares no
  `DbSet`s; modules contribute mappings via the `IModelContributor` port, so
  `Persistence` never references modules.
- Connection string comes from `DATABASE_URL` (Compose/CI) or
  `ConnectionStrings:Postgres` (local dev). Missing config is startup-fatal.
- Generate migrations from the Host so the full model is visible:
  `dotnet ef migrations add <Name> --project src/Persistence --startup-project
  src/Host` (run inside `services/api`).

Migration safety rules:

- Never modify a migration already committed to `main`; add a new forward one.
- Migrations are forward-only and idempotent. Never add a `NOT NULL` column (or a
  `UNIQUE`/FK/check constraint) to a table that may hold rows in one step:
  expand (add nullable) → backfill every row → constrain (`SET NOT NULL`).
- Seeding is explicit, idempotent, and development-only (`ISeeder`, run by
  `pnpm run db:seed`). It never runs automatically at production startup. Add or
  update a seeder in the same change that adds or changes an entity.

## API Contracts and OpenAPI

Routing describes **resources and capabilities**, not UI personas:

- Endpoints are resource-oriented: `/api/v1/<resource>`; there are no
  `/admin`, `/user`, or `/public` prefixes.
- Authentication is enforced at the edge (`RequireAuthorization`). A coarse
  capability is checked in the Application use case, and resource/owner scope is
  enforced inside it (see `GetWidgetHandler`).
- Failures map to RFC 7807 Problem Details with the app-owned error `code`;
  unexpected errors stay opaque 500s.

OpenAPI is the contract of record and is generated, never hand-edited:

- The Host serves `/openapi/v1.json`; the same document is emitted as the
  committed snapshot. Generation reads endpoint metadata only — it never opens a
  database or contacts an IdP.
- After any contract change, run `pnpm run openapi:sync` (regenerates the snapshot
  and the typed clients in `packages/schemas`). CI runs `pnpm run openapi:check`
  to fail on drift.

## Authentication and Logging

- JWT bearer tokens are validated at the edge and translated into the
  framework-neutral `IActorContext` (subject + capabilities); Application code
  never sees ASP.NET or JWT types.
- Logs are structured via `Microsoft.Extensions.Logging`. Every request carries a
  correlation id (`x-request-id`). Keep PII and secrets out of messages and
  fields; log an error where it is first observed.

## Related Docs

- `docs/testing.md`: automated testing expectations
- `docs/architecture.md`: system scope and module map
- `docs/glossary.md`: add new backend concepts and status names
