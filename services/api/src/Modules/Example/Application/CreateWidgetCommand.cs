namespace MyApp.Modules.Example.Application;

/// <summary>Intent to create a widget for the current actor. The owner comes from the actor, not the input.</summary>
public sealed record CreateWidgetCommand(string Name);
