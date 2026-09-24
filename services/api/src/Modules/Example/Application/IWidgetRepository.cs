using SpaceHero.Modules.Example.Domain;

namespace SpaceHero.Modules.Example.Application;

/// <summary>
/// Persistence port for the <see cref="Widget"/> aggregate. Application depends on this
/// abstraction; Infrastructure provides the EF Core implementation.
/// </summary>
public interface IWidgetRepository
{
    Task Add(Widget widget, CancellationToken cancellationToken = default);

    Task<Widget?> GetById(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Widgets that have not been soft-deleted, most recently created first.</summary>
    Task<IReadOnlyList<Widget>> ListActive(CancellationToken cancellationToken = default);

    Task SaveChanges(CancellationToken cancellationToken = default);
}
