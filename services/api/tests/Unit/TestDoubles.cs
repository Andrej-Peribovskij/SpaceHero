using MyApp.BuildingBlocks.Actors;
using MyApp.BuildingBlocks.Identifiers;
using MyApp.Modules.Example.Application;
using MyApp.Modules.Example.Domain;

namespace MyApp.Api.UnitTests;

internal sealed class FakeActor : IActorContext
{
    public bool IsAuthenticated { get; init; } = true;
    public string SubjectId { get; init; } = "owner-1";
    public IReadOnlySet<string> Capabilities { get; init; } = new HashSet<string>(StringComparer.Ordinal);
    public bool HasCapability(string capability) => Capabilities.Contains(capability);
}

internal sealed class FixedIdGenerator(Guid id) : IIdGenerator
{
    public Guid NewId() => id;
}

internal sealed class InMemoryWidgetRepository : IWidgetRepository
{
    private readonly Dictionary<Guid, Widget> _store = new();

    public Task Add(Widget widget, CancellationToken cancellationToken = default)
    {
        _store[widget.Id] = widget;
        return Task.CompletedTask;
    }

    public Task<Widget?> GetById(Guid id, CancellationToken cancellationToken = default) =>
        Task.FromResult(_store.GetValueOrDefault(id));

    public Task<IReadOnlyList<Widget>> ListActive(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<Widget>>(
            _store.Values
                .Where(widget => !widget.IsDeleted)
                .OrderByDescending(widget => widget.CreatedAt)
                .ToList());

    public Task SaveChanges(CancellationToken cancellationToken = default) => Task.CompletedTask;

    public void Seed(Widget widget) => _store[widget.Id] = widget;
}
