namespace MyApp.Modules.Example.Contracts;

/// <summary>
/// The Example module's public query port. Other modules call this instead of reaching
/// into Example's Domain, Application, or Infrastructure — the only supported seam between
/// modules within a service.
/// </summary>
public interface IWidgetCatalog
{
    Task<WidgetSummary?> Find(Guid id, CancellationToken cancellationToken = default);
}
