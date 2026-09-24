using SpaceHero.BuildingBlocks.Errors;
using SpaceHero.Modules.Example.Domain;
using Xunit;

namespace SpaceHero.Api.UnitTests;

public class WidgetNameTests
{
    [Fact]
    public void Create_trims_and_keeps_value()
    {
        var name = WidgetName.Create("  Gadget  ");
        Assert.Equal("Gadget", name.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Create_rejects_empty(string? value)
    {
        var exception = Assert.Throws<AppException>(() => WidgetName.Create(value));
        Assert.Equal(ErrorKind.Validation, exception.Kind);
        Assert.Equal("example.widget.name_required", exception.Code);
    }

    [Fact]
    public void Create_rejects_too_long()
    {
        var exception = Assert.Throws<AppException>(
            () => WidgetName.Create(new string('x', WidgetName.MaxLength + 1)));
        Assert.Equal("example.widget.name_too_long", exception.Code);
    }
}

public class WidgetTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_sets_owner_and_timestamps()
    {
        var widget = Widget.Create(Guid.CreateVersion7(), WidgetName.Create("A"), "owner-1", Now);

        Assert.Equal("owner-1", widget.OwnerId);
        Assert.Equal(Now, widget.CreatedAt);
        Assert.Equal(Now, widget.UpdatedAt);
        Assert.False(widget.IsDeleted);
    }

    [Fact]
    public void SoftDelete_marks_deleted_once()
    {
        var widget = Widget.Create(Guid.CreateVersion7(), WidgetName.Create("A"), "o", Now);
        var deletedAt = Now.AddHours(1);

        widget.SoftDelete(deletedAt);
        widget.SoftDelete(Now.AddHours(2));

        Assert.True(widget.IsDeleted);
        Assert.Equal(deletedAt, widget.DeletedAt);
    }
}
