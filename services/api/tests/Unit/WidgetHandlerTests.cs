using Microsoft.Extensions.Time.Testing;
using MyApp.BuildingBlocks.Errors;
using MyApp.Modules.Example.Application;
using MyApp.Modules.Example.Domain;
using Xunit;

namespace MyApp.Api.UnitTests;

public class CreateWidgetHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly Guid FixedId = Guid.CreateVersion7();

    /// <summary>
    /// FakeTimeProvider is the platform's own double for TimeProvider, so there is no hand-written
    /// clock to keep in step with the real one. Call Advance on it where a test needs time to move.
    /// </summary>
    private static CreateWidgetHandler Handler(FakeActor actor, IWidgetRepository repository) =>
        new(actor, repository, new FixedIdGenerator(FixedId), new FakeTimeProvider(Now));

    [Fact]
    public async Task Rejects_unauthenticated_actor()
    {
        var handler = Handler(new FakeActor { IsAuthenticated = false }, new InMemoryWidgetRepository());

        var exception = await Assert.ThrowsAsync<AppException>(
            () => handler.Handle(new CreateWidgetCommand("Gadget")));

        Assert.Equal(ErrorKind.Unauthenticated, exception.Kind);
    }

    [Fact]
    public async Task Rejects_actor_without_write_capability()
    {
        var handler = Handler(new FakeActor(), new InMemoryWidgetRepository());

        var exception = await Assert.ThrowsAsync<AppException>(
            () => handler.Handle(new CreateWidgetCommand("Gadget")));

        Assert.Equal(ErrorKind.Forbidden, exception.Kind);
    }

    [Fact]
    public async Task Creates_widget_owned_by_actor()
    {
        var repository = new InMemoryWidgetRepository();
        var actor = new FakeActor
        {
            SubjectId = "owner-9",
            Capabilities = new HashSet<string>(StringComparer.Ordinal) { WidgetCapabilities.Write },
        };

        var widget = await Handler(actor, repository).Handle(new CreateWidgetCommand("Gadget"));

        Assert.Equal(FixedId, widget.Id);
        Assert.Equal("owner-9", widget.OwnerId);
        Assert.Equal("Gadget", widget.Name.Value);
        Assert.Equal(Now, widget.CreatedAt);
    }
}

public class GetWidgetHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static FakeActor ActorWith(string subject, params string[] capabilities) => new()
    {
        SubjectId = subject,
        Capabilities = new HashSet<string>(capabilities, StringComparer.Ordinal),
    };

    [Fact]
    public async Task Missing_widget_is_not_found()
    {
        var handler = new GetWidgetHandler(ActorWith("me", WidgetCapabilities.Read), new InMemoryWidgetRepository());

        var exception = await Assert.ThrowsAsync<AppException>(() => handler.Handle(Guid.CreateVersion7()));

        Assert.Equal(ErrorKind.NotFound, exception.Kind);
    }

    [Fact]
    public async Task Reading_another_owners_widget_is_forbidden()
    {
        var repository = new InMemoryWidgetRepository();
        var widget = Widget.Create(Guid.CreateVersion7(), WidgetName.Create("A"), "someone-else", Now);
        repository.Seed(widget);

        var handler = new GetWidgetHandler(ActorWith("me", WidgetCapabilities.Read), repository);
        var exception = await Assert.ThrowsAsync<AppException>(() => handler.Handle(widget.Id));

        Assert.Equal(ErrorKind.Forbidden, exception.Kind);
        Assert.Equal("example.widget.cross_scope", exception.Code);
    }

    [Fact]
    public async Task Owner_reads_own_widget()
    {
        var repository = new InMemoryWidgetRepository();
        var widget = Widget.Create(Guid.CreateVersion7(), WidgetName.Create("A"), "me", Now);
        repository.Seed(widget);

        var result = await new GetWidgetHandler(ActorWith("me", WidgetCapabilities.Read), repository).Handle(widget.Id);

        Assert.Equal(widget.Id, result.Id);
    }

    [Fact]
    public async Task ReadAny_capability_crosses_owner_scope()
    {
        var repository = new InMemoryWidgetRepository();
        var widget = Widget.Create(Guid.CreateVersion7(), WidgetName.Create("A"), "someone-else", Now);
        repository.Seed(widget);

        var result = await new GetWidgetHandler(ActorWith("me", WidgetCapabilities.ReadAny), repository).Handle(widget.Id);

        Assert.Equal(widget.Id, result.Id);
    }
}
