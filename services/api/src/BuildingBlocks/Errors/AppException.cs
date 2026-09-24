namespace MyApp.BuildingBlocks.Errors;

/// <summary>
/// A deliberate, expected failure raised by Domain or Application code. It carries a
/// transport-neutral <see cref="ErrorKind"/> and a stable, app-owned <see cref="Code"/>
/// that clients can branch on. The HTTP boundary maps it to Problem Details; it must
/// never be used for programming errors.
/// </summary>
public sealed class AppException : Exception
{
    public AppException(ErrorKind kind, string code, string message)
        : base(message)
    {
        Kind = kind;
        Code = code;
    }

    /// <summary>The transport-neutral failure category.</summary>
    public ErrorKind Kind { get; }

    /// <summary>Stable, app-owned error code (for example <c>example.not_found</c>).</summary>
    public string Code { get; }
}
