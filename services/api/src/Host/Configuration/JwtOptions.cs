using System.ComponentModel.DataAnnotations;

namespace SpaceHero.Api.Configuration;

/// <summary>Bearer-token validation settings bound from the <c>Jwt</c> configuration section.</summary>
internal sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>Symmetric signing key. Supplied per environment; never committed for production.</summary>
    [Required]
    [MinLength(32)]
    public string Secret { get; init; } = string.Empty;

    /// <summary>Expected token issuer. Issuer validation is skipped when empty.</summary>
    public string Issuer { get; init; } = string.Empty;

    /// <summary>Expected token audience. Audience validation is skipped when empty.</summary>
    public string Audience { get; init; } = string.Empty;
}
