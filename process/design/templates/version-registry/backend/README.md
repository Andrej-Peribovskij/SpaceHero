# The runtime config endpoint

The one thing the version registry needs from a backend, and the reason it needs it.

## The contract

```
GET <PUBLIC_CONFIG_PATH>        default: /api/v1/public-config
→ 200 application/json
  { "publicUiVersion": "v1.0.0" }
```

Four requirements, all of them load-bearing:

1. **Unauthenticated.** It gates first paint, and is asked before there is a session to ask
   with. Nothing secret may ever be added to this response.
2. **Read fresh per request**, from the process environment — never captured at startup into a
   singleton, never baked into the frontend bundle. This is the whole point: moving the public
   version is an environment line plus an API restart, with no frontend rebuild, which is what
   makes prompt 06's flip and its rollback one line each. A deployment that cannot reach its
   package registry cannot rebuild itself, so a baked value can never be changed in place.
3. **`PUBLIC_UI_VERSION` outranks any settings file.** Prompt 06 and every runbook say
   `PUBLIC_UI_VERSION=…`; an operator moving the public version must not be silently outranked
   by a committed default.
4. **Empty is a legitimate answer**, meaning "this deployment names no version". The frontend
   falls back to the first registered production version and says loudly in the console that it
   did — a deployment that names no version is a mistake worth seeing, not a default worth
   hiding.

## What is here

| Path | For |
|---|---|
| `dotnet/PublicOptions.cs`, `dotnet/PublicConfigEndpoints.cs` | ASP.NET Core minimal APIs |
| `node/public-config.ts` | Node — an Express/Fastify-shaped handler and the framework-free reader under it |

Copy the one that matches, adjust the namespace or the mount, and register it. Neither file is
copied into the service for you: an API endpoint is an architectural decision
about *your* service, not scaffolding, and the script will not guess where your service lives.
It does check whether the endpoint exists and reports it as a missing host requirement until it
does.

## After copying

Set the variable in every environment, including local:

```
PUBLIC_UI_VERSION=v1.0.0
```

Then confirm the round trip — with the API running, the frontend's console should be silent
about the public version, and `curl` should answer:

```bash
curl -s http://localhost:<port>/api/v1/public-config
# {"publicUiVersion":"v1.0.0"}
```

A version named here that the registry does not carry, or that is a design version, is refused
by the frontend and logged. That is deliberate: design versions are mocked and administrator-only,
and serving one at the root would show real users invented figures that look exactly like real
ones.
