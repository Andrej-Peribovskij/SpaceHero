using SpaceHero.BuildingBlocks.Actors;
using SpaceHero.BuildingBlocks.Errors;
using SpaceHero.Modules.Example.Domain;

namespace SpaceHero.Modules.Example.Application;

/// <summary>
/// Reads a single widget. Requires a read capability, then enforces owner scope: an actor
/// without <see cref="WidgetCapabilities.ReadAny"/> may only read its own widgets.
/// </summary>
public sealed class GetWidgetHandler(IActorContext actor, IWidgetRepository repository)
{
    public async Task<Widget> Handle(Guid id, CancellationToken cancellationToken = default)
    {
        if (!actor.IsAuthenticated)
        {
            throw new AppException(ErrorKind.Unauthenticated, "auth.required", "Authentication is required.");
        }

        if (!actor.HasCapability(WidgetCapabilities.Read) && !actor.HasCapability(WidgetCapabilities.ReadAny))
        {
            throw new AppException(
                ErrorKind.Forbidden,
                "auth.forbidden",
                $"Missing capability: {WidgetCapabilities.Read}.");
        }

        var widget = await repository.GetById(id, cancellationToken)
            ?? throw new AppException(ErrorKind.NotFound, "example.widget.not_found", "Widget not found.");

        if (widget.OwnerId != actor.SubjectId && !actor.HasCapability(WidgetCapabilities.ReadAny))
        {
            throw new AppException(
                ErrorKind.Forbidden,
                "example.widget.cross_scope",
                "Widget belongs to another owner.");
        }

        return widget;
    }
}
