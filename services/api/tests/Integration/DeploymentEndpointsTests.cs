using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using SpaceHero.Api.Authentication;
using SpaceHero.Api.Endpoints;
using Xunit;

namespace SpaceHero.Api.IntegrationTests;

/// <summary>
/// The two deployment-level endpoints the UI version registry depends on. Neither touches
/// the database, so both run in the no-database suite.
/// </summary>
public class DeploymentEndpointsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory = factory;

    /// <summary>
    /// The load-bearing property of <c>/me</c>, and the reason it is not behind the auth edge.
    ///
    /// A logged-out visitor has to render the public UI version, and the version gate asks
    /// this endpoint before deciding what to mount. A 401 here would stop the gate rendering
    /// for exactly the audience the public version exists for. So: an unauthenticated ANSWER,
    /// not an unauthenticated error.
    /// </summary>
    [Fact]
    public async Task Me_answers_an_anonymous_caller_rather_than_rejecting_it()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<MeResponse>();

        Assert.NotNull(body);
        Assert.False(body.Authenticated);
        Assert.Equal(string.Empty, body.SubjectId);
        Assert.Empty(body.Capabilities);
    }

    [Fact]
    public async Task Me_reports_the_capabilities_on_the_token()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            TestTokens.For("user-1", PlatformCapabilities.DesignVersionsPreview));

        var body = await client.GetFromJsonAsync<MeResponse>("/api/v1/me");

        Assert.NotNull(body);
        Assert.True(body.Authenticated);
        Assert.Equal("user-1", body.SubjectId);
        Assert.Contains(PlatformCapabilities.DesignVersionsPreview, body.Capabilities);
    }

    /// <summary>
    /// The capability the frontend gates the prefixed version mounts on. Pinned as a literal
    /// here rather than compared to the constant, because the frontend has its own copy of
    /// this string in <c>use-is-administrator.ts</c> and the two can only drift if nothing
    /// states the value in a place a reviewer will see.
    /// </summary>
    /// <summary>
    /// The endpoint answers an anonymous caller, and answers with what the environment says.
    ///
    /// The test host runs as Development, so it reads the same appsettings.Development.json a
    /// developer runs with: configured, because a template whose config endpoint serves an
    /// empty string on a fresh clone teaches that the empty string is normal.
    /// </summary>
    [Fact]
    public async Task PublicConfig_answers_an_anonymous_caller_with_the_configured_version()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/public-config");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<PublicConfigResponse>();

        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body.PublicUiVersion));
    }

    /// <summary>
    /// The flat variable outranks the section, which is the precedence an operator relies on:
    /// prompt 06 and every runbook move the public version with <c>PUBLIC_UI_VERSION=…</c>, and a
    /// value in a committed settings file must not silently win over it.
    ///
    /// Exercised through the endpoint rather than by calling the resolver, which is internal to
    /// the host. Widening it so a test could reach it directly would test the wrong thing: what
    /// matters is that an operator sets a variable and the running API answers with it, over the
    /// <c>Public:UiVersion</c> that appsettings.Development.json supplies underneath.
    /// </summary>
    [Fact]
    public async Task The_flat_variable_outranks_the_committed_section()
    {
        using var factory = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration(configuration =>
                configuration.AddInMemoryCollection(
                    new Dictionary<string, string?> { ["PUBLIC_UI_VERSION"] = "v9.9.9" })));

        var client = factory.CreateClient();

        var body = await client.GetFromJsonAsync<PublicConfigResponse>("/api/v1/public-config");

        Assert.NotNull(body);
        Assert.Equal("v9.9.9", body.PublicUiVersion);
    }
}
