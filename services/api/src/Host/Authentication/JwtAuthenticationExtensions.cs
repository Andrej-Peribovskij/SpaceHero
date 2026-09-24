using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SpaceHero.Api.Configuration;
using SpaceHero.BuildingBlocks.Actors;

namespace SpaceHero.Api.Authentication;

/// <summary>
/// Registers standard JWT bearer authentication at the HTTP boundary and exposes the
/// validated principal to Application code through <see cref="IActorContext"/>.
/// </summary>
internal static class JwtAuthenticationExtensions
{
    public static IServiceCollection AddApiAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        var jwt = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Keep claim names as issued ("sub", "capability") instead of remapping
                // them to legacy WS-* URIs, so the neutral actor stays transport-agnostic.
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
                    ValidateIssuer = !string.IsNullOrEmpty(jwt.Issuer),
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = !string.IsNullOrEmpty(jwt.Audience),
                    ValidAudience = jwt.Audience,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = ClaimsActorContext.SubjectClaimType,
                };
            });

        services.AddAuthorization();
        services.AddHttpContextAccessor();
        services.AddScoped<IActorContext, ClaimsActorContext>();

        return services;
    }
}
