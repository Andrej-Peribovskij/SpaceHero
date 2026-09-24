using Microsoft.EntityFrameworkCore;

namespace MyApp.Persistence;

/// <summary>
/// Contributes a module's entity configurations to the shared <see cref="AppDbContext"/>
/// model. Module Infrastructure projects implement this; the API composition root registers
/// each one. Persistence never references modules, so it discovers them only through this port.
/// </summary>
public interface IModelContributor
{
    void Apply(ModelBuilder modelBuilder);
}
