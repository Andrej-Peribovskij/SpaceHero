namespace MyApp.BuildingBlocks.Identifiers;

/// <summary>Produces UUID v7 identifiers (time-ordered) using the native runtime generator.</summary>
public sealed class IdGenerator : IIdGenerator
{
    public Guid NewId() => Guid.CreateVersion7();
}
