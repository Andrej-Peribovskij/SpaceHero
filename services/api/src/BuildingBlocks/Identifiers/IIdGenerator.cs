namespace SpaceHero.BuildingBlocks.Identifiers;

/// <summary>
/// Generates sortable, time-ordered identifiers. Inject this instead of calling
/// <see cref="Guid.CreateVersion7()"/> directly so identifiers are controllable in tests.
/// </summary>
public interface IIdGenerator
{
    Guid NewId();
}
