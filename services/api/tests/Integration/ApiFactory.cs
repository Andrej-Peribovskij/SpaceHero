using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SpaceHero.Api.IntegrationTests;

/// <summary>
/// Hosts the API in-process. Runs in the Development environment so the dev JWT secret
/// and connection string are present; endpoints that do not touch the database (liveness,
/// unauthenticated requests) are exercised without a running PostgreSQL.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
    }
}
