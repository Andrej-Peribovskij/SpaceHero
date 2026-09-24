namespace SpaceHero.Api.Authentication;

/// <summary>
/// Capabilities that describe what an actor may do with the deployment itself, rather than
/// with any one bounded context. A module's capabilities live beside that module's use cases
/// (see <c>WidgetCapabilities</c>); these have no module to live in.
/// </summary>
public static class PlatformCapabilities
{
    /// <summary>
    /// May reach the prefixed, non-public UI version mounts — <c>/v2.0.0/…</c> and
    /// <c>/design/…</c>.
    ///
    /// Deliberately NOT a bare "admin". ADR-0003 fixes capabilities as dotted
    /// <c>&lt;area&gt;.&lt;resource&gt;.&lt;action&gt;</c> names describing what the actor may
    /// do rather than who they are, and a template that shipped "admin" would teach every
    /// generated project the opposite of the decision it also ships. The frontend's
    /// <c>useIsAdministrator()</c> reads this name and nothing else.
    /// </summary>
    public const string DesignVersionsPreview = "platform.design-versions.preview";
}
