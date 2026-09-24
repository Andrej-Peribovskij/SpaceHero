namespace SpaceHero.Api.Configuration;

/// <summary>Registers the default CORS policy from the <c>Cors</c> configuration section.</summary>
internal static class CorsExtensions
{
    public static IServiceCollection AddApiCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var options = configuration.GetSection(CorsOptions.SectionName).Get<CorsOptions>() ?? new CorsOptions();

        services.AddCors(cors => cors.AddDefaultPolicy(policy =>
        {
            if (options.AllowedOrigins.Length == 0)
            {
                return;
            }

            policy
                .WithOrigins(options.AllowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        }));

        return services;
    }
}
