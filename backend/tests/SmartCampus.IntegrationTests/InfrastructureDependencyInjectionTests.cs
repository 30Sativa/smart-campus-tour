using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
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
                    "Server=localhost,1433;Database=SmartCampusTests;Trusted_Connection=True;TrustServerCertificate=True;"
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

    [Fact]
    public void AddInfrastructure_ReadsFleetCommandsEnabled_OnlyWhenConfigured()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Server=localhost,1433;Database=SmartCampusTests;Trusted_Connection=True;",
                ["FleetCommands:Enabled"] = "true"
            })
            .Build();

        using var provider = new ServiceCollection().AddInfrastructure(configuration).BuildServiceProvider();

        Assert.True(provider.GetRequiredService<FleetCommandSettings>().Enabled);
    }

    [Fact]
    public void AddInfrastructure_FleetCommandsDefaults_KeepTransportOff_WithAdr0042Limits()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Server=localhost,1433;Database=SmartCampusTests;Trusted_Connection=True;"
            })
            .Build();
        using var provider = new ServiceCollection().AddInfrastructure(configuration).BuildServiceProvider();

        var settings = provider.GetRequiredService<FleetCommandSettings>();
        Assert.False(settings.Enabled);
        Assert.Equal(TimeSpan.FromSeconds(2), settings.MaxTelemetryAge);
        Assert.Equal(TimeSpan.FromMinutes(15), settings.StartLateLimit);
        Assert.Equal(TimeSpan.FromSeconds(30), settings.AcceptWindow);
        // No per-user console tracking yet: presence is unknown, never connected.
        Assert.Null(provider.GetRequiredService<IOperatorConsolePresence>().IsConnected(Guid.NewGuid()));
    }
}
