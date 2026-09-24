using SpaceHero.BuildingBlocks.Actors;

namespace SpaceHero.Api.Endpoints;

/// <summary>Who the caller is, as far as this deployment is concerned.</summary>
/// <param name="Authenticated">False for an anonymous caller. Not an error — see below.</param>
/// <param name="SubjectId">The token subject, or empty when anonymous.</param>
/// <param name="Capabilities">The actor's capabilities, empty when anonymous.</param>
public sealed record MeResponse(bool Authenticated, string SubjectId, IReadOnlyCollection<string> Capabilities);

/// <summary>
/// The caller's own identity and capabilities, for gating UI affordances.
///
/// ANONYMOUS-SAFE ON PURPOSE, and that is the load-bearing property rather than a convenience.
/// A logged-out visitor has to be able to render the public UI version, and the version gate
/// asks this endpoint before it can decide what to mount. If an anonymous caller got a 401 the
/// gate could not render at all for exactly the audience the public version exists for. So an
/// unauthenticated caller gets an unauthenticated ANSWER: 200, with <c>authenticated: false</c>.
/// ADR-0003 allows this explicitly — unauthenticated endpoints are a deliberate choice at the
/// edge, not an oversight.
///
/// It reads <see cref="IActorContext"/>, the framework-neutral view the authentication layer
/// already produces, so this endpoint adds no second interpretation of a token's claims.
///
/// Lives in the Host rather than a feature module because it describes the caller's relationship
/// to the deployment, not to a bounded context — the same reason public-config does.
/// </summary>
public static class MeEndpoints
{
    public static IEndpointRouteBuilder MapMeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints
            .MapGet("/api/v1/me", GetMe)
            .WithTags("Identity")
            .WithName("GetMe")
            .AllowAnonymous()
            .Produces<MeResponse>();

        return endpoints;
    }

    private static IResult GetMe(IActorContext actor) =>
        Results.Ok(actor.IsAuthenticated
            ? new MeResponse(true, actor.SubjectId, actor.Capabilities.OrderBy(c => c, StringComparer.Ordinal).ToArray())
            // Not `actor.SubjectId` and `actor.Capabilities` even though both are already empty
            // when anonymous: spelling the anonymous shape out means a future change to
            // ClaimsActorContext cannot leak a partial identity through this endpoint.
            : new MeResponse(false, string.Empty, []));
}
