using Microsoft.EntityFrameworkCore;
using MyApp.BuildingBlocks.Identifiers;
using MyApp.Modules.Example.Domain;
using MyApp.Persistence;
using MyApp.Persistence.Seeding;

namespace MyApp.Modules.Example.Infrastructure.Persistence;

/// <summary>Idempotent development seed: one sample widget when the table is empty.</summary>
internal sealed class WidgetSeeder(IIdGenerator idGenerator, TimeProvider timeProvider) : ISeeder
{
    public async Task Seed(AppDbContext dbContext, CancellationToken cancellationToken = default)
    {
        if (await dbContext.Set<Widget>().AnyAsync(cancellationToken))
        {
            return;
        }

        var widget = Widget.Create(
            idGenerator.NewId(),
            WidgetName.Create("Sample widget"),
            ownerId: "seed-owner",
            timeProvider.GetUtcNow());

        await dbContext.Set<Widget>().AddAsync(widget, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
