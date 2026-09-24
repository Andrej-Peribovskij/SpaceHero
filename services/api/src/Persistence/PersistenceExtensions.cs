using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SpaceHero.Persistence;

/// <summary>Registers the service-owned <see cref="AppDbContext"/> against PostgreSQL.</summary>
public static class PersistenceExtensions
{
    public static IServiceCollection AddPersistence(
        this IServiceCollection services,
        string connectionString)
    {
        var npgsql = DatabaseUrl.ToNpgsqlConnectionString(connectionString);

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(npgsql, npgsqlOptions =>
                npgsqlOptions.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName)));

        return services;
    }
}
