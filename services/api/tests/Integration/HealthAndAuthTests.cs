using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace SpaceHero.Api.IntegrationTests;

/// <summary>
/// Endpoint coverage that does not require a database: liveness, the contract document,
/// and the authentication boundary — the edge rejects an unauthenticated request before
/// any handler runs, so no connection is needed to prove it. Data-backed paths live in
/// <see cref="WidgetEndpointsTests"/> and run via `pnpm run test:integration`.
/// </summary>
public class HealthAndAuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory = factory;

    [Fact]
    public async Task Liveness_returns_ok()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task OpenApi_document_is_served()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [RequiresDatabaseFact]
    public async Task Readiness_returns_ok_when_the_database_is_reachable()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [RequiresDatabaseFact]
    public async Task Listing_widgets_needs_no_token()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/widgets");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Getting_a_widget_without_a_token_is_unauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/widgets/{Guid.CreateVersion7()}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Creating_a_widget_without_a_token_is_unauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/widgets", new { name = "Gadget" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
