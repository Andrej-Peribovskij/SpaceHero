using Microsoft.Extensions.DependencyInjection;

namespace MyApp.Persistence.Seeding;

/// <summary>Runs every registered <see cref="ISeeder"/> once, in registration order.</summary>
public static class DatabaseSeeding
{
    public static async Task Run(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        foreach (var seeder in scope.ServiceProvider.GetServices<ISeeder>())
        {
            await seeder.Seed(dbContext, cancellationToken);
        }
    }
}
