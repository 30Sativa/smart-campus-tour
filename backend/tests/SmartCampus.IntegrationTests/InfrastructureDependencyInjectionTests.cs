using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class InfrastructureDependencyInjectionTests
{
    [Fact]
    public void AddInfrastructure_UsesSameScopedDbContextForCommitBoundary()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] =
                    "Server=(localdb)\\mssqllocaldb;Database=SmartCampusTests;Trusted_Connection=True;"
            })
            .Build();
        var services = new ServiceCollection();

        services.AddInfrastructure(configuration);

        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var concreteContext = scope.ServiceProvider
            .GetRequiredService<ApplicationDbContext>();
        var commitBoundary = scope.ServiceProvider
            .GetRequiredService<IApplicationDbContext>();

        Assert.Same(concreteContext, commitBoundary);
    }

    [Fact]
    public void AddInfrastructure_MissingConnectionString_FailsFast()
    {
        var configuration = new ConfigurationBuilder().Build();
        var services = new ServiceCollection();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            services.AddInfrastructure(configuration));

        Assert.Contains("DefaultConnection", exception.Message);
    }
}
