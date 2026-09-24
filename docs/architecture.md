# Architecture Guide

Purpose: define the durable system shape, domain boundaries, and integration
philosophy.

## Quick Scan

- This is a modular monorepo: `apps/web` calls `services/api`, which persists
  to PostgreSQL.
- Bounded contexts live under `services/api/src/Modules/` and own distinct
  business capabilities.
- Cross-module backend access goes through each module's `Contracts` project only.
- The generated OpenAPI snapshot is the shared contract of record; typed clients
  are generated from it into `packages/schemas`.
- Third-party services sit behind app-owned adapters.
- Vendor concepts do not belong in domain or application models.
- UUID v7 is the standard identifier format.

## System Scope

```
┌────────────────────────────────────────────┐
│  apps/web (React + Vite)                   │
│    Views → Hooks → HTTP Client → API       │
└──────────────────┬─────────────────────────┘
                   │ REST / JSON
┌──────────────────▼─────────────────────────┐
│  services/api (ASP.NET Core / .NET)        │
│    Endpoints → Use Cases → Entities        │
│    EF Core Repositories → PostgreSQL       │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│  PostgreSQL                                │
└────────────────────────────────────────────┘
```

## Shared Packages

| Package | Purpose |
|---------|---------|
| `packages/schemas` | OpenAPI snapshot (`api-v1.json`) + generated TypeScript clients |

## Module Map

Backend modules live under `services/api/src/Modules/`. Each module is a
bounded context, one project per layer:

- `Domain` — entities, value objects, and rules
- `Application` — use cases and ports
- `Infrastructure` — EF configuration, repositories, endpoints, and adapters
- `Contracts` — the public surface other modules may depend on

Add new modules as the domain grows. Keep modules cohesive around a single
business capability.

## Integration Philosophy

- Third-party services sit behind adapters that translate vendor concepts to
  domain language at the boundary.
- Vendor DTOs, enums, and identifiers never leak into domain or application
  layers.
- External API keys and configuration use the ASP.NET Core configuration and
  options system (`IOptions<T>`), bound and validated at startup.
- Outgoing HTTP calls use a traced client for observability.

## Data Flow

- Frontend fetches data through TanStack Query hooks.
- API responses follow the shapes described by the OpenAPI snapshot.
- The OpenAPI snapshot in `packages/schemas` is the contract of record; the
  frontend consumes types generated from it.
- Contract changes update backend, frontend, and OpenAPI in the same change.

## Conventions

- Application-generated IDs are UUID v7.
- All timestamps are UTC.
- Database tables are named `{module}_{table}`.
- Soft delete uses `deleted_at` (NULL = active).
- New entities include `created_at`, `updated_at`, and `deleted_at`.
