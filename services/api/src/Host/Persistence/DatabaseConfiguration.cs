namespace MyApp.Api.Persistence;

/// <summary>Resolves the database connection string for the service.</summary>
internal static class DatabaseConfiguration
{
    public static string GetConnectionString(IConfiguration configuration)
    {
        // DATABASE_URL (Docker Compose / CI) takes precedence; local dev falls back to
        // the ConnectionStrings:Postgres value in appsettings.Development.json.
        // An empty DATABASE_URL counts as unset, not as an override: CI clears it to
        // opt a step out of the database-backed tests, and an environment variable
        // set to "" is present-but-empty rather than absent, so `??` would not fall
        // back. This matches how RequiresDatabaseFactAttribute reads the same variable.
        var connection = configuration["DATABASE_URL"];

        if (string.IsNullOrWhiteSpace(connection))
        {
            connection = configuration.GetConnectionString("Postgres");
        }

        if (string.IsNullOrWhiteSpace(connection))
        {
            throw new InvalidOperationException(
                "No database connection configured. Set DATABASE_URL or ConnectionStrings:Postgres.");
        }

        return connection;
    }
}
