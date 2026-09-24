namespace MyApp.Api.Configuration;

/// <summary>
/// Configuration the frontend is allowed to read before anyone signs in, bound from the
/// <c>Public</c> section.
///
/// Everything here is world-readable by construction — it is served to an unauthenticated
/// browser by <c>GET /api/v1/public-config</c> — so a value only belongs in this section if
/// publishing it is harmless. Nothing that gates access, names an internal host or identifies
/// an account goes here.
/// </summary>
internal sealed class PublicOptions
{
    public const string SectionName = "Public";

    /// <summary>
    /// The UI version served unprefixed at the root — the one real users see.
    ///
    /// Deliberately read here rather than baked into the frontend bundle. Moving the public
    /// version is an environment edit plus an API restart, with no frontend rebuild, which is
    /// what makes the flip one-line reversible — and is what the design → code process's
    /// prompt 06 requires.
    ///
    /// Empty means unconfigured. The frontend then falls back to the first registered
    /// production version and says loudly in the console that it did — a deployment that names
    /// no version is a mistake worth seeing, not a default worth hiding.
    /// </summary>
    public string UiVersion { get; init; } = string.Empty;
}
