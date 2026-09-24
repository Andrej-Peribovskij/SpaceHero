using Xunit;

namespace MyApp.Api.IntegrationTests;

/// <summary>
/// A fact that needs a real PostgreSQL, and says so instead of failing when there is none.
///
/// `pnpm run test` runs the whole suite with no database, so these skip. `pnpm run
/// test:integration` starts one on 5433, applies the migrations, and sets DATABASE_URL —
/// and then they run. A skip prints its reason, so a suite that covered less than it
/// claims is visible in the output rather than silent.
/// </summary>
public sealed class RequiresDatabaseFactAttribute : FactAttribute
{
    public RequiresDatabaseFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DATABASE_URL")))
        {
            Skip = "No DATABASE_URL. Run `pnpm run test:integration` for the database-backed tests.";
        }
    }
}
