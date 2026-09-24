using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SpaceHero.Modules.Example.Application;
using SpaceHero.Modules.Example.Contracts;
using SpaceHero.Modules.Example.Infrastructure.Http;
using SpaceHero.Modules.Example.Infrastructure.Persistence;
using SpaceHero.Persistence;
using SpaceHero.Persistence.Seeding;

namespace SpaceHero.Modules.Example.Infrastructure;

/// <summary>
/// Composition surface for the Example module. The service host calls
/// <see cref="AddExampleModule"/> once during startup and <see cref="MapExampleModule"/>
/// when mapping endpoints; nothing else needs to know the module's internals.
/// </summary>
public static class ExampleModule
{
    public static IServiceCollection AddExampleModule(this IServiceCollection services)
    {
        services.AddScoped<CreateWidgetHandler>();
        services.AddScoped<GetWidgetHandler>();
        services.AddScoped<ListWidgetsHandler>();

        services.AddScoped<WidgetRepository>();
        services.AddScoped<IWidgetRepository>(sp => sp.GetRequiredService<WidgetRepository>());
        services.AddScoped<IWidgetCatalog>(sp => sp.GetRequiredService<WidgetRepository>());

        services.AddSingleton<IModelContributor, ExampleModelContributor>();
        services.AddScoped<ISeeder, WidgetSeeder>();

        return services;
    }

    public static IEndpointRouteBuilder MapExampleModule(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapWidgetEndpoints();
        return endpoints;
    }
}
