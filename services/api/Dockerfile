# syntax=docker/dockerfile:1
# Build context is this service directory (services/api). Works with Docker or Podman.
ARG DOTNET_VERSION=10.0

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
WORKDIR /src

# Restore first (cached unless the spine or lockfiles change).
COPY global.json Directory.Build.props Directory.Packages.props api.slnx ./
COPY src/ ./src/
RUN dotnet restore api.slnx

# Publish the host as a framework-dependent app.
RUN dotnet publish src/Host/SpaceHero.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime
WORKDIR /app
COPY --from=build /app ./

# Run as the image's built-in non-root user and listen on an unprivileged port.
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "SpaceHero.Api.dll"]
