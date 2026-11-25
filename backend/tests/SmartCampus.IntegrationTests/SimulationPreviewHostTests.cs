using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Api.Hubs;

namespace SmartCampus.IntegrationTests;

// Preview registers no Infrastructure, so its DB-backed handlers cannot be built.
public sealed class SimulationPreviewHostTests
{
    private const string UnusedDatabase =
        "Server=127.0.0.1,1;Database=SimulationPreviewDoesNotConnect;User ID=unused;Password=unused;TrustServerCertificate=true;Connect Timeout=1";

    [Fact]
    public async Task DevelopmentPreviewHost_Starts_AndAcceptsPose()
    {
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(UnusedDatabase,
            new Dictionary<string, string> { ["SimulationPreview__Enabled"] = "true" });

        using var response = await host.Client.PostAsJsonAsync("/api/simulation/pose", new
        {
            robotId = "robot_01", source = "gazebo", worldId = "map3d-preview-v1", frameId = "gazebo_world",
            streamId = Guid.NewGuid(), seq = 1, capturedAt = DateTimeOffset.UtcNow, x = 1.0, y = 2.0, z = 0.0, yaw = 0.5
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public void PreviewOff_KeepsDevelopmentValidateOnBuild()
    {
        var builder = DevelopmentBuilderWithUnresolvableService();
        builder.Host.UseSimulationPreviewServiceValidation(enabled: false);

        Assert.Throws<AggregateException>(() => builder.Build());
    }

    [Fact]
    public async Task PreviewOn_SkipsValidateOnBuild()
    {
        var builder = DevelopmentBuilderWithUnresolvableService();
        builder.Host.UseSimulationPreviewServiceValidation(enabled: true);

        await using var app = builder.Build();
        Assert.Throws<InvalidOperationException>(() => app.Services.GetRequiredService<NeedsMissingDependency>());
    }

    private static WebApplicationBuilder DevelopmentBuilderWithUnresolvableService()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.Services.AddTransient<NeedsMissingDependency>();
        return builder;
    }

    private interface IMissingDependency;

    private sealed class NeedsMissingDependency(IMissingDependency dependency)
    {
        public IMissingDependency Dependency { get; } = dependency;
    }
}
