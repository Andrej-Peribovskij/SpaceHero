namespace SpaceHero.Modules.Example.Infrastructure.Http;

/// <summary>Request body for creating a widget.</summary>
public sealed record CreateWidgetRequest(string Name);

/// <summary>API representation of a widget returned to clients.</summary>
public sealed record WidgetResponse(Guid Id, string Name, DateTimeOffset CreatedAt);
