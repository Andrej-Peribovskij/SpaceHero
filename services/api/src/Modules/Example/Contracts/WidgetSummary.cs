namespace SpaceHero.Modules.Example.Contracts;

/// <summary>A stable, read-only projection of a widget that other modules may depend on.</summary>
public sealed record WidgetSummary(Guid Id, string Name, DateTimeOffset CreatedAt);
