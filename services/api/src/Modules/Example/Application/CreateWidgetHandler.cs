using SpaceHero.BuildingBlocks.Actors;
using SpaceHero.BuildingBlocks.Errors;
using SpaceHero.BuildingBlocks.Identifiers;
using SpaceHero.Modules.Example.Domain;

namespace SpaceHero.Modules.Example.Application;

/// <summary>
/// The one authorized write use case: create a widget owned by the current actor.
/// Enforces authentication, the write capability, and domain validation in that order.
/// </summary>
public sealed class CreateWidgetHandler(
    IActorContext actor,
    IWidgetRepository repository,
    IIdGenerator idGenerator,
    TimeProvider timeProvider)
{
    public async Task<Widget> Handle(CreateWidgetCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsAuthenticated)
        {
            throw new AppException(ErrorKind.Unauthenticated, "auth.required", "Authentication is required.");
        }

        if (!actor.HasCapability(WidgetCapabilities.Write))
        {
            throw new AppException(
                ErrorKind.Forbidden,
                "auth.forbidden",
                $"Missing capability: {WidgetCapabilities.Write}.");
        }

        var name = WidgetName.Create(command.Name);
        var widget = Widget.Create(idGenerator.NewId(), name, actor.SubjectId, timeProvider.GetUtcNow());

        await repository.Add(widget, cancellationToken);
        await repository.SaveChanges(cancellationToken);

        return widget;
    }
}
