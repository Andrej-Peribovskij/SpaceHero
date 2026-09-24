using System.Security.Claims;
using MyApp.BuildingBlocks.Actors;

namespace MyApp.Api.Authentication;

/// <summary>
/// Translates the current request's validated bearer-token claims into the
/// framework-neutral <see cref="IActorContext"/> the Application layer consumes.
/// </summary>
internal sealed class ClaimsActorContext(IHttpContextAccessor accessor) : IActorContext
{
    /// <summary>Claim type carrying a coarse capability granted to the actor.</summary>
    internal const string CapabilityClaimType = "capability";

    /// <summary>Claim type carrying the actor's stable subject identifier.</summary>
    internal const string SubjectClaimType = "sub";

    private ClaimsPrincipal? User => accessor.HttpContext?.User;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated ?? false;

    public string SubjectId => User?.FindFirst(SubjectClaimType)?.Value ?? string.Empty;

    public IReadOnlySet<string> Capabilities =>
        User?.FindAll(CapabilityClaimType).Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal)
        ?? new HashSet<string>(StringComparer.Ordinal);

    public bool HasCapability(string capability) => Capabilities.Contains(capability);
}
