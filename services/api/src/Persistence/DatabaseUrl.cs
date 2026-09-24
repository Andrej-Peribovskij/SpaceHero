using Npgsql;

namespace SpaceHero.Persistence;

/// <summary>
/// Converts a <c>postgres(ql)://user:pass@host:port/db</c> URL — the form used by the
/// Docker Compose stack and CI (<c>DATABASE_URL</c>) — into an Npgsql key/value
/// connection string. A value that is already key/value is returned unchanged.
/// </summary>
public static class DatabaseUrl
{
    public static string ToNpgsqlConnectionString(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);

        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        var uri = new Uri(value);
        var userInfo = uri.UserInfo.Split(':', 2);

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
        };

        return builder.ConnectionString;
    }
}
