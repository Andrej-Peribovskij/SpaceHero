using Microsoft.EntityFrameworkCore;

namespace MyApp.Persistence;

/// <summary>
/// The single service-owned database context and migration stream. It holds no
/// <c>DbSet</c> properties of its own; each module contributes its entity configuration
/// through an <see cref="IModelContributor"/>, keeping persistence decoupled from modules.
/// </summary>
public sealed class AppDbContext(
    DbContextOptions<AppDbContext> options,
    IEnumerable<IModelContributor> modelContributors)
    : DbContext(options)
{
    private readonly IEnumerable<IModelContributor> _modelContributors = modelContributors;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        foreach (var contributor in _modelContributors)
        {
            contributor.Apply(modelBuilder);
        }

        ModelConventions.ApplySnakeCaseColumnNames(modelBuilder);
    }
}
