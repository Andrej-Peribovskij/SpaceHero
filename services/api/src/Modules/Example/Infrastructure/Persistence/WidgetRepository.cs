using Microsoft.EntityFrameworkCore;
using SpaceHero.Modules.Example.Application;
using SpaceHero.Modules.Example.Contracts;
using SpaceHero.Modules.Example.Domain;
using SpaceHero.Persistence;

namespace SpaceHero.Modules.Example.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of the Example persistence port and the public catalog. The
/// aggregate has no <c>DbSet</c> on <see cref="AppDbContext"/>; it is reached via <c>Set</c>.
/// </summary>
internal sealed class WidgetRepository(AppDbContext dbContext) : IWidgetRepository, IWidgetCatalog
{
    public async Task Add(Widget widget, CancellationToken cancellationToken = default) =>
        await dbContext.Set<Widget>().AddAsync(widget, cancellationToken);

    public Task<Widget?> GetById(Guid id, CancellationToken cancellationToken = default) =>
        dbContext.Set<Widget>().FirstOrDefaultAsync(widget => widget.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Widget>> ListActive(CancellationToken cancellationToken = default) =>
        await dbContext.Set<Widget>()
            .Where(widget => widget.DeletedAt == null)
            .OrderByDescending(widget => widget.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task SaveChanges(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);

    public async Task<WidgetSummary?> Find(Guid id, CancellationToken cancellationToken = default)
    {
        var widget = await dbContext.Set<Widget>()
            .FirstOrDefaultAsync(widget => widget.Id == id, cancellationToken);

        return widget is null
            ? null
            : new WidgetSummary(widget.Id, widget.Name.Value, widget.CreatedAt);
    }
}
