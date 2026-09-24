using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SpaceHero.Modules.Example.Domain;

namespace SpaceHero.Modules.Example.Infrastructure.Persistence;

/// <summary>
/// EF Core mapping for <see cref="Widget"/>. The table carries the module prefix
/// (<c>example_widgets</c>); columns are normalized to snake_case by the shared convention.
/// </summary>
internal sealed class WidgetConfiguration : IEntityTypeConfiguration<Widget>
{
    public void Configure(EntityTypeBuilder<Widget> builder)
    {
        builder.ToTable("example_widgets");

        builder.HasKey(widget => widget.Id);
        builder.Property(widget => widget.Id).ValueGeneratedNever();

        builder.Property(widget => widget.Name)
            .HasConversion(name => name.Value, value => WidgetName.Create(value))
            .HasMaxLength(WidgetName.MaxLength)
            .IsRequired();

        builder.Property(widget => widget.OwnerId)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(widget => widget.CreatedAt).IsRequired();
        builder.Property(widget => widget.UpdatedAt).IsRequired();
        builder.Property(widget => widget.DeletedAt);

        // Soft delete: NULL deleted_at means active. Deleted rows are filtered out globally.
        builder.HasQueryFilter(widget => widget.DeletedAt == null);

        builder.HasIndex(widget => widget.OwnerId);
    }
}
