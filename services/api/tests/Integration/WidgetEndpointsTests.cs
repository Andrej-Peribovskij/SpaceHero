using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using SpaceHero.Modules.Example.Application;
using Xunit;

namespace SpaceHero.Api.IntegrationTests;

/// <summary>
/// The full request chain for the widgets resource: routing, model binding, the capability
/// check, owner scope, EF Core, PostgreSQL, and the Problem Details mapping on the way
/// back. The 401 cases live in <see cref="HealthAndAuthTests"/> — the edge rejects those
/// before any handler runs, so they need no database.
/// </summary>
public class WidgetEndpointsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory = factory;

    [RequiresDatabaseFact]
    public async Task Creating_a_widget_returns_it_and_lists_it()
    {
        var client = Authenticated("owner-1", WidgetCapabilities.Write);

        var created = await client.PostAsJsonAsync("/api/v1/widgets", new { name = "Gadget" });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var widget = await created.Content.ReadFromJsonAsync<WidgetPayload>();
        Assert.NotNull(widget);
        Assert.Equal("Gadget", widget.Name);

        // Listing is anonymous, so this uses a client with no token at all.
        var listed = await _factory.CreateClient().GetFromJsonAsync<List<WidgetPayload>>("/api/v1/widgets");
        Assert.Contains(listed!, candidate => candidate.Id == widget.Id);
    }

    [RequiresDatabaseFact]
    public async Task Creating_a_widget_without_the_capability_is_forbidden()
    {
        var client = Authenticated("owner-2", WidgetCapabilities.Read);

        var response = await client.PostAsJsonAsync("/api/v1/widgets", new { name = "Gadget" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertProblemCode(response, "auth.forbidden");
    }

    [RequiresDatabaseFact]
    public async Task An_empty_name_is_a_validation_problem()
    {
        var client = Authenticated("owner-3", WidgetCapabilities.Write);

        var response = await client.PostAsJsonAsync("/api/v1/widgets", new { name = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [RequiresDatabaseFact]
    public async Task An_unknown_widget_is_a_not_found_problem()
    {
        var client = Authenticated("owner-4", WidgetCapabilities.Read);

        var response = await client.GetAsync($"/api/v1/widgets/{Guid.CreateVersion7()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertProblemCode(response, "example.widget.not_found");
    }

    [RequiresDatabaseFact]
    public async Task Another_owners_widget_is_out_of_scope()
    {
        var owner = Authenticated("owner-5", WidgetCapabilities.Write);
        var created = await owner.PostAsJsonAsync("/api/v1/widgets", new { name = "Private" });
        var widget = await created.Content.ReadFromJsonAsync<WidgetPayload>();

        // A different subject, holding only the plain read capability.
        var stranger = Authenticated("owner-6", WidgetCapabilities.Read);
        var response = await stranger.GetAsync($"/api/v1/widgets/{widget!.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertProblemCode(response, "example.widget.cross_scope");
    }

    [RequiresDatabaseFact]
    public async Task Read_any_crosses_owner_scope()
    {
        var owner = Authenticated("owner-7", WidgetCapabilities.Write);
        var created = await owner.PostAsJsonAsync("/api/v1/widgets", new { name = "Audited" });
        var widget = await created.Content.ReadFromJsonAsync<WidgetPayload>();

        var support = Authenticated("support-1", WidgetCapabilities.ReadAny);
        var response = await support.GetAsync($"/api/v1/widgets/{widget!.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private HttpClient Authenticated(string subject, params string[] capabilities)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", TestTokens.For(subject, capabilities));
        return client;
    }

    private static async Task AssertProblemCode(HttpResponseMessage response, string expected)
    {
        var problem = await response.Content.ReadFromJsonAsync<ProblemPayload>();

        Assert.Equal(expected, problem?.Code);
    }

    private sealed record WidgetPayload(Guid Id, string Name, DateTimeOffset CreatedAt);

    private sealed record ProblemPayload(string? Code, string? Detail);
}
