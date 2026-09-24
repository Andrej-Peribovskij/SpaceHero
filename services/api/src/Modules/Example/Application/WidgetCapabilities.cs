namespace MyApp.Modules.Example.Application;

/// <summary>
/// Coarse capabilities the edge grants an actor. They describe what the actor may do,
/// not who they are; resource/owner scope is enforced separately inside each use case.
/// </summary>
public static class WidgetCapabilities
{
    public const string Write = "example.widgets.write";
    public const string Read = "example.widgets.read";

    /// <summary>Read widgets owned by any actor (crosses owner scope; e.g. support/admin).</summary>
    public const string ReadAny = "example.widgets.read.any";
}
