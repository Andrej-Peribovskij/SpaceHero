// Regenerates each backend service's committed OpenAPI snapshot.
//
// The document is produced by the ASP.NET Core build-time generator running in the
// Development environment (so options validation passes with the dev secret) — it reads
// only endpoint metadata and never opens a database connection or contacts an IdP.
//
// Add a service by appending to `services`; see docs/generated for the workflow.
import { execFileSync } from "node:child_process";
import { globSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const services = [
  {
    name: "api",
    // Self-contained .NET service directory; dotnet runs here so global.json applies.
    dir: "services/api",
    project: "src/Host/SpaceHero.Api.csproj",
    // getdocument names the file after the assembly.
    documentFile: "SpaceHero.Api.json",
    snapshot: "packages/schemas/openapi/api-v1.json",
  },
];

for (const service of services) {
  const serviceDir = join(repoRoot, service.dir);
  const outputDir = mkdtempSync(join(tmpdir(), `openapi-${service.name}-`));

  // The generator caches on assembly inputs, not the output path, so an unchanged build
  // would otherwise skip writing. Clear the cache to force a fresh, deterministic emit.
  for (const cache of globSync(join(serviceDir, dirname(service.project), "obj/*.OpenApiFiles.cache"))) {
    rmSync(cache, { force: true });
  }

  execFileSync(
    "dotnet",
    [
      "build",
      service.project,
      "-t:GenerateOpenApiDocuments",
      `-p:OpenApiDocumentsDirectory=${outputDir}`,
      "--nologo",
      "-v:quiet",
    ],
    { cwd: serviceDir, stdio: "inherit", env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Development" } },
  );

  // Normalize formatting so the committed snapshot is byte-stable for the drift gate.
  const document = JSON.parse(readFileSync(join(outputDir, service.documentFile), "utf8"));
  const snapshotPath = join(repoRoot, service.snapshot);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(document, null, 2)}\n`);

  console.log(`Wrote ${service.snapshot}`);
}
