namespace SpaceHero.BuildingBlocks.Actors;

/// <summary>
/// The framework-neutral view of the caller for the current operation. The HTTP
/// boundary translates bearer-token claims into this shape; Application code reads
/// it and never sees ASP.NET or JWT types.
/// </summary>
public interface IActorContext
{
    /// <summary>True when a valid principal was presented on the request.</summary>
    bool IsAuthenticated { get; }

    /// <summary>Stable subject identifier of the actor (the token subject claim).</summary>
    string SubjectId { get; }

    /// <summary>Coarse capabilities granted to the actor, translated from token claims.</summary>
    IReadOnlySet<string> Capabilities { get; }

    /// <summary>True when the actor holds the named capability.</summary>
    bool HasCapability(string capability);
}
