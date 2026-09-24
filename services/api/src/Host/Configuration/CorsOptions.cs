namespace MyApp.Api.Configuration;

/// <summary>Cross-origin settings bound from the <c>Cors</c> configuration section.</summary>
internal sealed class CorsOptions
{
    public const string SectionName = "Cors";

    /// <summary>Browser origins permitted to call the API. Empty disables cross-origin access.</summary>
    public string[] AllowedOrigins { get; init; } = [];
}
