namespace MyApp.Persistence.Seeding;

/// <summary>
/// A module-provided, development-only data seed. Seeders are explicit and repeatable
/// (idempotent), and they never run automatically at production startup — only through
/// the deliberate seed command.
/// </summary>
public interface ISeeder
{
    Task Seed(AppDbContext dbContext, CancellationToken cancellationToken = default);
}
