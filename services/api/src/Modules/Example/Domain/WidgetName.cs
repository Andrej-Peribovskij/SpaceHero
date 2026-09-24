using SpaceHero.BuildingBlocks.Errors;

namespace SpaceHero.Modules.Example.Domain;

/// <summary>
/// A validated widget name. Constructing one guarantees the invariant (non-empty,
/// within length), so the rest of the domain can trust it without re-checking.
/// </summary>
public sealed record WidgetName
{
    public const int MaxLength = 120;

    private WidgetName(string value) => Value = value;

    public string Value { get; }

    public static WidgetName Create(string? value)
    {
        var trimmed = value?.Trim() ?? string.Empty;

        if (trimmed.Length == 0)
        {
            throw new AppException(ErrorKind.Validation, "example.widget.name_required", "Widget name is required.");
        }

        if (trimmed.Length > MaxLength)
        {
            throw new AppException(
                ErrorKind.Validation,
                "example.widget.name_too_long",
                $"Widget name must be at most {MaxLength} characters.");
        }

        return new WidgetName(trimmed);
    }

    public override string ToString() => Value;
}
