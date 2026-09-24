namespace MyApp.Api.Errors;

/// <summary>Registers Problem Details generation and the app-owned exception handler.</summary>
internal static class ProblemDetailsExtensions
{
    public static IServiceCollection AddApiProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options =>
            options.CustomizeProblemDetails = context =>
            {
                context.ProblemDetails.Instance ??= context.HttpContext.Request.Path;
                context.ProblemDetails.Extensions["requestId"] = context.HttpContext.TraceIdentifier;
            });

        services.AddExceptionHandler<AppExceptionHandler>();

        return services;
    }
}
