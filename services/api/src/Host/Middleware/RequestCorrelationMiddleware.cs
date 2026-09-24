using SpaceHero.BuildingBlocks.Identifiers;

namespace SpaceHero.Api.Middleware;

/// <summary>
/// Ensures every request carries a correlation id. It reuses an inbound
/// <c>x-request-id</c> when present (the web client sends one) or mints a UUID v7,
/// echoes it on the response, and scopes it into logs.
/// </summary>
internal sealed class RequestCorrelationMiddleware(
    RequestDelegate next,
    IIdGenerator idGenerator,
    ILogger<RequestCorrelationMiddleware> logger)
{
    internal const string HeaderName = "x-request-id";

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = context.Request.Headers[HeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(requestId))
        {
            requestId = idGenerator.NewId().ToString();
        }

        context.TraceIdentifier = requestId;
        context.Response.Headers[HeaderName] = requestId;

        using (logger.BeginScope(new Dictionary<string, object> { ["RequestId"] = requestId }))
        {
            await next(context);
        }
    }
}
