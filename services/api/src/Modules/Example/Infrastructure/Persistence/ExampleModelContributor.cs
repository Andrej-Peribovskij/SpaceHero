using Microsoft.EntityFrameworkCore;
using MyApp.Persistence;

namespace MyApp.Modules.Example.Infrastructure.Persistence;

/// <summary>Registers the Example module's entity configurations into the shared model.</summary>
internal sealed class ExampleModelContributor : IModelContributor
{
    public void Apply(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfiguration(new WidgetConfiguration());
}
