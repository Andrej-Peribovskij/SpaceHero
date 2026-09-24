using MyApp.Api.Configuration;

namespace MyApp.Api.Endpoints;

/// <summary>What an unauthenticated browser may know about this deployment.</summary>
/// <param name="PublicUiVersion">
/// The UI version served unprefixed at the root. Empty when the deployment names none, which
/// the frontend reports rather than papers over.
/// </param>
public sealed record PublicConfigResponse(string PublicUiVersion);

/// <summary>
/// The frontend's runtime configuration, for the values it needs before it can render anything.
///
/// There is exactly one such value: which UI version is public. Every canonical path
/// ("/briefing") is unresolvable until it is known — the route table to match against belongs to
/// a version — so the app blocks first paint on this response rather than guessing and
/// re-rendering.
///
/// Unauthenticated on purpose: it gates first paint, and it is asked before there is a session
/// to ask with. Nothing here is a secret (see <see cref="PublicOptions"/>).
///
/// Read from configuration on every request, not captured at startup, so
/// <c>PUBLIC_UI_VERSION</c> takes effect on an API restart with no frontend rebuild. That is the
/// property the design → code process's prompt 06 depends on: the flip and its rollback are one
/// environment line each.
///
/// Lives in the Host rather than a feature module because it describes the deployment, not a
/// bounded context — the same reason the health endpoints do.
/// </summary>
public static class PublicConfigEndpoints
{
    public static IEndpointRouteBuilder MapPublicConfigEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints
            .MapGet("/api/v1/public-config", GetPublicConfig)
            .WithTags("Configuration")
            .WithName("GetPublicConfig")
            .AllowAnonymous()
            .Produces<PublicConfigResponse>();

        return endpoints;
    }

    private static IResult GetPublicConfig(IConfiguration configuration) =>
        Results.Ok(new PublicConfigResponse(UiVersion(configuration)));

    /// <summary>
    /// Which version is public.
    ///
    /// Precedence: the flat <c>PUBLIC_UI_VERSION</c> variable, then <c>Public:UiVersion</c>
    /// (settable as <c>Public__UiVersion</c>). The flat name comes first because it is the one
    /// the flip is performed with — prompt 06 and every runbook say <c>PUBLIC_UI_VERSION=…</c>,
    /// and an operator moving the public version must not have it silently outranked by a value
    /// in a committed settings file.
    /// </summary>
    internal static string UiVersion(IConfiguration configuration)
    {
        var flat = configuration["PUBLIC_UI_VERSION"];

        if (!string.IsNullOrWhiteSpace(flat))
        {
            return flat.Trim();
        }

        var options = configuration.GetSection(PublicOptions.SectionName).Get<PublicOptions>()
            ?? new PublicOptions();

        return options.UiVersion.Trim();
    }
}
