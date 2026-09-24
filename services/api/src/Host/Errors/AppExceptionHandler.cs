using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using MyApp.BuildingBlocks.Errors;

namespace MyApp.Api.Errors;

/// <summary>
/// Maps deliberate <see cref="AppException"/> failures to RFC 7807 Problem Details with a
/// stable, app-owned error code. Anything else is left for the framework to turn into an
/// opaque 500, so internal detail never leaks to clients.
/// </summary>
internal sealed class AppExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not AppException app)
        {
            return false;
        }

        var status = StatusFor(app.Kind);
        httpContext.Response.StatusCode = status;

        var problem = new ProblemDetails
        {
            Status = status,
            Title = TitleFor(app.Kind),
            Detail = app.Message,
        };
        problem.Extensions["code"] = app.Code;

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = app,
            ProblemDetails = problem,
        });
    }

    private static int StatusFor(ErrorKind kind) => kind switch
    {
        ErrorKind.Validation => StatusCodes.Status400BadRequest,
        ErrorKind.Unauthenticated => StatusCodes.Status401Unauthorized,
        ErrorKind.Forbidden => StatusCodes.Status403Forbidden,
        ErrorKind.NotFound => StatusCodes.Status404NotFound,
        ErrorKind.Conflict => StatusCodes.Status409Conflict,
        _ => StatusCodes.Status500InternalServerError,
    };

    private static string TitleFor(ErrorKind kind) => kind switch
    {
        ErrorKind.Validation => "Validation failed",
        ErrorKind.Unauthenticated => "Authentication required",
        ErrorKind.Forbidden => "Forbidden",
        ErrorKind.NotFound => "Not found",
        ErrorKind.Conflict => "Conflict",
        _ => "Unexpected error",
    };
}
