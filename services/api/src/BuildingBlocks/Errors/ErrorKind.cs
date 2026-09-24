namespace SpaceHero.BuildingBlocks.Errors;

/// <summary>
/// The transport-neutral category of a domain or application failure. The HTTP
/// boundary maps each kind to a status code and RFC 7807 Problem Details response.
/// </summary>
public enum ErrorKind
{
    Validation,
    Unauthenticated,
    Forbidden,
    NotFound,
    Conflict,
    Unexpected,
}
