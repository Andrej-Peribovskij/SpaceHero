namespace SpaceHero.Api.OpenApi;

/// <summary>
/// Registers the OpenAPI document that is both served at runtime (<c>/openapi/v1.json</c>)
/// and emitted as the committed snapshot at build time. Generation reads only endpoint
/// metadata, so it never opens a database connection or contacts an identity provider.
/// </summary>
internal static class OpenApiExtensions
{
    public const string DocumentName = "v1";

    public static IServiceCollection AddApiOpenApi(this IServiceCollection services)
    {
        services.AddOpenApi(DocumentName, options =>
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info.Title = "SpaceHero API";
                document.Info.Version = "1.0.0";
                return Task.CompletedTask;
            }));

        return services;
    }
}
