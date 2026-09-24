# `pnpm run image:web` cannot pass its registry secret on a Windows podman client

**Created:** 2026-09-22
**Module:** tooling / images

## What

The web image installs the design system from GitHub Packages, so its build
needs a registry token. The token is passed as a BuildKit secret, which is the
only way to give it to the build without putting it in a build argument
(`podman history` shows those) or in a layer.

On Windows, `podman build --secret` fails before the build starts:

```
Error: creating temp file: open /mnt/c/<context path>\podman-build-secret-…:
The system cannot find the path specified.
```

The client stages the secret in a temp file whose path it builds from the
WSL-translated context directory joined with a Windows separator, so nothing can
open it. It fails identically for `src=<file>` and `env=<VAR>`, and it fails on
a two-line Dockerfile with no relation to this repository, so it is the client
and not our build. Podman 5.8.2, podman-machine-default on WSL.

`pnpm run image:api` is unaffected — the API image needs no registry token.

## Why

Accepted rather than worked around, because every workaround is worse than the
defect:

- A build argument or a `COPY`'d `.npmrc` puts a credential in the image
  metadata or in a layer, which is the thing the secret exists to prevent.
- Pre-fetching the tarball outside the build and vendoring it into the context
  reintroduces the vendoring this change removed.
- Pinning to Docker Desktop for image builds contradicts ADR-0002.

CI is on Linux and builds nothing, so nothing merges red because of this. The
cost falls on a Windows developer who wants to build the web image locally,
which is not on the common path — the dev loop is `pnpm run dev`, and
`stack:up` builds only the API image.

## Resolution

Track the podman issue and drop this file when the Windows client stages the
secret correctly. Until then, a Windows developer who needs the web image builds
it from inside WSL, where the same command works:

```bash
wsl -d podman-machine-default
cd /mnt/c/<path to the repo>
printf '%s' "$NODE_AUTH_TOKEN" > /tmp/na.tok
podman build -f apps/web/Dockerfile --secret id=node_auth_token,src=/tmp/na.tok -t my-app-web .
rm -f /tmp/na.tok
```

This was verified end to end while writing it: the image builds, `/root/.npmrc`
does not exist in any stage, the shipped `/app/.npmrc` carries only the registry
routing, and no layer or history entry holds the token.
