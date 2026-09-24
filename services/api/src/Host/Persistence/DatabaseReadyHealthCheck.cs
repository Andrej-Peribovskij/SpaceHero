using Microsoft.Extensions.Diagnostics.HealthChecks;
using MyApp.Persistence;

namespace MyApp.Api.Persistence;

/// <summary>Readiness probe: reports healthy only when the database is reachable.</summary>
internal sealed class DatabaseReadyHealthCheck(AppDbContext dbContext) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var canConnect = await dbContext.Database.CanConnectAsync(cancellationToken);

        return canConnect
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("Database is not reachable.");
    }
}
