using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using MyApp.Api.Authentication;
using MyApp.Api.Configuration;
using MyApp.Api.Endpoints;
using MyApp.Api.Errors;
using MyApp.Api.Middleware;
using MyApp.Api.OpenApi;
using MyApp.Api.Persistence;
using MyApp.BuildingBlocks.Identifiers;
using MyApp.Modules.Example.Infrastructure;
using MyApp.Persistence;
using MyApp.Persistence.Seeding;

var builder = WebApplication.CreateBuilder(args);

// --- Composition: register cross-cutting services. ---
builder.Services.AddApiProblemDetails();
builder.Services.AddApiAuthentication(builder.Configuration);
builder.Services.AddApiCors(builder.Configuration);

// TimeProvider.System is the platform clock. Inject TimeProvider, never DateTimeOffset.UtcNow:
// tests substitute FakeTimeProvider, which also virtualises timers.
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IIdGenerator, IdGenerator>();

builder.Services.AddPersistence(DatabaseConfiguration.GetConnectionString(builder.Configuration));

builder.Services
    .AddHealthChecks()
    .AddCheck<DatabaseReadyHealthCheck>("database", tags: ["ready"]);

builder.Services.AddApiOpenApi();

// --- Modules: each bounded context is composed here through its Infrastructure surface. ---
builder.Services.AddExampleModule();

var app = builder.Build();

// Deliberate, development-only data seeding: `dotnet run seed` (wired to db:seed).
if (args.Length > 0 && args[0] == "seed")
{
    await DatabaseSeeding.Run(app.Services);
    return;
}

// --- Middleware order: correlation first, then error mapping, then auth. ---
app.UseExceptionHandler();
app.UseMiddleware<RequestCorrelationMiddleware>();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Operational health endpoints. Liveness runs no checks (is the process up?);
// readiness runs only checks tagged "ready" (can it serve traffic?). Both sit
// outside /api/v1 and never require authentication.
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("ready"),
});

// Deployment-level endpoints: what an anonymous browser may know about this deployment,
// and who the caller is. Both sit inside /api/v1 and both allow anonymous callers
// deliberately — see each one's own note for why that is load-bearing rather than lax.
app.MapPublicConfigEndpoints();
app.MapMeEndpoints();

// OpenAPI document at /openapi/v1.json (also emitted as the committed snapshot at build).
app.MapOpenApi();

// --- Module endpoints. ---
app.MapExampleModule();

app.Run();

// Exposed as a public contract solely so integration tests can host the app with
// WebApplicationFactory<Program>. Top-level statements generate this type in the
// global namespace, so the partial must stay there too.
public partial class Program;
