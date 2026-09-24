namespace SpaceHero.Modules.Example.Domain;

/// <summary>
/// The reference aggregate: a widget owned by the actor that created it. Timestamps are
/// UTC (<see cref="DateTimeOffset"/>); deletion is soft (<see cref="DeletedAt"/> set,
/// row retained). State only changes through the methods below.
/// </summary>
public sealed class Widget
{
    // Materialization constructor for EF Core.
    private Widget()
    {
        Name = null!;
        OwnerId = null!;
    }

    private Widget(Guid id, WidgetName name, string ownerId, DateTimeOffset timestamp)
    {
        Id = id;
        Name = name;
        OwnerId = ownerId;
        CreatedAt = timestamp;
        UpdatedAt = timestamp;
    }

    public Guid Id { get; private set; }

    public WidgetName Name { get; private set; }

    /// <summary>Subject id of the actor that owns this widget; the unit of access scope.</summary>
    public string OwnerId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public DateTimeOffset? DeletedAt { get; private set; }

    public bool IsDeleted => DeletedAt.HasValue;

    public static Widget Create(Guid id, WidgetName name, string ownerId, DateTimeOffset now) =>
        new(id, name, ownerId, now);

    public void Rename(WidgetName name, DateTimeOffset now)
    {
        Name = name;
        UpdatedAt = now;
    }

    public void SoftDelete(DateTimeOffset now)
    {
        if (IsDeleted)
        {
            return;
        }

        DeletedAt = now;
        UpdatedAt = now;
    }
}
