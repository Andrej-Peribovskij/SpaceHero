using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace SpaceHero.Api.IntegrationTests;

/// <summary>
/// Mints bearer tokens the running host accepts, signed with the Development secret from
/// <c>appsettings.Development.json</c>.
///
/// The tests sign their own because this scaffold validates tokens without issuing them.
/// Once an identity module exists, these tests log in through it instead and this file
/// goes away — the point being that a capability claim is what the API reads either way.
/// </summary>
internal static class TestTokens
{
    private const string Secret = "dev-only-secret-change-me-in-production-0123456789";
    private const string Issuer = "spacehero";
    private const string Audience = "spacehero";

    public static string For(string subject, params string[] capabilities)
    {
        var claims = new List<Claim> { new("sub", subject) };
        claims.AddRange(capabilities.Select(capability => new Claim("capability", capability)));

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Issuer = Issuer,
            Audience = Audience,
            Expires = DateTime.UtcNow.AddMinutes(10),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
                SecurityAlgorithms.HmacSha256),
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
