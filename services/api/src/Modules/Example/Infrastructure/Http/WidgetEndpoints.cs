using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MyApp.Modules.Example.Application;
using MyApp.Modules.Example.Domain;

namespace MyApp.Modules.Example.Infrastructure.Http;

/// <summary>
/// Resource-oriented HTTP surface for widgets. Routes describe the resource, not a UI
/// persona; authentication is required at the edge and capability/scope inside the handler.
/// </summary>
public static class WidgetEndpoints
{
    public static IEndpointRouteBuilder MapWidgetEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var widgets = endpoints
            .MapGroup("/api/v1/widgets")
            .WithTags("Widgets")
            .RequireAuthorization();

        widgets.MapPost("/", CreateWidget)
            .WithName("CreateWidget")
            .Produces<WidgetResponse>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        widgets.MapGet("/{id:guid}", GetWidget)
            .WithName("GetWidget")
            .Produces<WidgetResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        // The one open read on this resource, so the example shows both halves of the
        // authorization model in one place: a read anyone may make, and a write that needs
        // a capability. `AllowAnonymous` opts out of the group's requirement.
        widgets.MapGet("/", ListWidgets)
            .AllowAnonymous()
            .WithName("ListWidgets")
            .Produces<IReadOnlyList<WidgetResponse>>();

        return endpoints;
    }

    private static async Task<IResult> ListWidgets(
        ListWidgetsHandler handler,
        CancellationToken cancellationToken)
    {
        var widgets = await handler.Handle(cancellationToken);
        return Results.Ok(widgets.Select(ToResponse).ToList());
    }

    private static async Task<IResult> CreateWidget(
        CreateWidgetRequest request,
        CreateWidgetHandler handler,
        CancellationToken cancellationToken)
    {
        var widget = await handler.Handle(new CreateWidgetCommand(request.Name), cancellationToken);
        return Results.Created($"/api/v1/widgets/{widget.Id}", ToResponse(widget));
    }

    private static async Task<IResult> GetWidget(
        Guid id,
        GetWidgetHandler handler,
        CancellationToken cancellationToken)
    {
        var widget = await handler.Handle(id, cancellationToken);
        return Results.Ok(ToResponse(widget));
    }

    private static WidgetResponse ToResponse(Widget widget) =>
        new(widget.Id, widget.Name.Value, widget.CreatedAt);
}
