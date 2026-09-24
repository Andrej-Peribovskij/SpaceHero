using MyApp.Modules.Example.Domain;

namespace MyApp.Modules.Example.Application;

/// <summary>
/// Lists the widgets on record, most recently created first.
///
/// Deliberately open: this is the one endpoint the example exposes without a token, so the
/// resource shows both halves of the authorization model in one place — a read anyone may
/// make, and a write that needs a capability. A real catalogue endpoint would usually be
/// scoped; replace this with whatever the domain actually requires.
/// </summary>
public sealed class ListWidgetsHandler(IWidgetRepository repository)
{
    public Task<IReadOnlyList<Widget>> Handle(CancellationToken cancellationToken = default) =>
        repository.ListActive(cancellationToken);
}
