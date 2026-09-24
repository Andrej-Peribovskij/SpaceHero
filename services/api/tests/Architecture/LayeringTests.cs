using System.Reflection;
using MyApp.Modules.Example.Application;
using MyApp.Modules.Example.Contracts;
using MyApp.Modules.Example.Domain;
using Xunit;

namespace MyApp.Api.ArchitectureTests;

/// <summary>
/// Enforces the layering at the assembly level: Domain, Application, and Contracts must
/// not reference ASP.NET Core, EF Core, or the database driver. These references only
/// appear in an assembly's metadata when its code actually uses the types.
/// </summary>
public class LayeringTests
{
    private static readonly string[] ForbiddenPrefixes =
    [
        "Microsoft.AspNetCore",
        "Microsoft.EntityFrameworkCore",
        "Npgsql",
    ];

    [Fact]
    public void Domain_references_no_framework()
        => AssertNoForbiddenReferences(typeof(Widget).Assembly);

    [Fact]
    public void Application_references_no_framework()
        => AssertNoForbiddenReferences(typeof(CreateWidgetHandler).Assembly);

    [Fact]
    public void Contracts_references_no_framework()
        => AssertNoForbiddenReferences(typeof(IWidgetCatalog).Assembly);

    private static void AssertNoForbiddenReferences(Assembly assembly)
    {
        var violations = assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name ?? string.Empty)
            .Where(name => ForbiddenPrefixes.Any(prefix => name.StartsWith(prefix, StringComparison.Ordinal)))
            .ToArray();

        Assert.True(
            violations.Length == 0,
            $"{assembly.GetName().Name} must not reference: {string.Join(", ", violations)}");
    }
}
