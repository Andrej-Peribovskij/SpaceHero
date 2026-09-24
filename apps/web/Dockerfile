# syntax=docker/dockerfile:1
# Build context is the repo root, so the workspace packages the app depends on are
# inside it. Built with `pnpm run image:web` (podman build).
ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27-alpine

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS deps
ARG TARGETPLATFORM
ARG BUILDPLATFORM
WORKDIR /app

# pnpm comes from the "packageManager" field, so the image uses the pinned version.
RUN corepack enable

# .npmrc routes the @ptv-mobility scope to GitHub Packages. It carries no
# credential — see the file itself, and the RUN below for where the token comes from.
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The registry-token check runs from .pnpmfile.cjs even under --ignore-scripts, and
# the lockfile records the pnpmfile's checksum, so the hook and the two files it
# runs come in with the manifests.
COPY .pnpmfile.cjs                                   ./
COPY scripts/check-registry-token.mjs                ./scripts/check-registry-token.mjs
COPY scripts/lib/registry-token.mjs                  ./scripts/lib/registry-token.mjs
COPY apps/web/package.json                           ./apps/web/package.json
COPY packages/schemas/package.json                   ./packages/schemas/package.json

# The design system installs from GitHub Packages, which authenticates reads as
# well as writes, so this install needs a token. It arrives as a BuildKit secret:
# not a build argument, which `podman history` would show, and not a file in a
# layer, which anyone with the image could read.
#
# pnpm refuses to expand an environment variable in an auth setting that comes
# from a project .npmrc, so the credential has to be read from a user-level one.
# That file is written and removed inside this single RUN, so no layer holds it —
# only the literal `${NODE_AUTH_TOKEN}`, expanded in memory, ever exists on disk.
#
# Only the web app and what it depends on; the E2E workspace has no place in an image.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=node_auth_token \
    set -eu; \
    if [ ! -s /run/secrets/node_auth_token ]; then \
      echo "ERROR: missing build secret 'node_auth_token'." >&2; \
      echo "       The design system installs from GitHub Packages and needs a" >&2; \
      echo "       read:packages token. Build with 'pnpm run image:web', which" >&2; \
      echo "       passes \$NODE_AUTH_TOKEN through as this secret." >&2; \
      exit 1; \
    fi; \
    printf '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n' > /root/.npmrc; \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" \
      pnpm install --frozen-lockfile --ignore-scripts --filter ./apps/web...; \
    rm -f /root/.npmrc

FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json                              ./
COPY apps/web/                                       ./apps/web/
COPY packages/schemas/                               ./packages/schemas/

RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm --filter ./apps/web run build

FROM --platform=$TARGETPLATFORM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime
ARG TARGETPLATFORM
ARG BUILDPLATFORM
WORKDIR /usr/share/nginx/html

COPY --from=build /app/apps/web/nginx/default.conf   /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/               ./

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
