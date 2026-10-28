using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

public sealed class PoiManagementEndpointTests
{
    [Fact]
    public async Task LegacyPoiCatalogPathsAreRemovedFromRouting()
    {
        const string unusedDatabase = "Server=127.0.0.1,1;Database=Unused;User ID=unused;Password=unused;TrustServerCertificate=true;Connect Timeout=1";
        await using var host = await ApiHost.StartForDatabaseAsync(unusedDatabase);
        foreach (var (method, path) in new[]
        {
            (HttpMethod.Get, "/api/staff/manage/pois"), (HttpMethod.Post, "/api/staff/manage/pois"),
            (HttpMethod.Get, "/api/admin/pois"), (HttpMethod.Post, "/api/admin/pois"),
            (HttpMethod.Put, "/api/admin/pois/00000000-0000-0000-0000-000000000001"),
            (HttpMethod.Post, "/api/admin/pois/00000000-0000-0000-0000-000000000001/activate")
        })
        {
            using var request = new HttpRequestMessage(method, path);
            using var response = await host.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        using var proposals = await host.Client.GetAsync("/api/staff/poi-proposals");
        Assert.Equal(HttpStatusCode.Unauthorized, proposals.StatusCode);
        using var verification = await host.Client.GetAsync("/api/technical/poi-verifications");
        Assert.Equal(HttpStatusCode.Unauthorized, verification.StatusCode);
    }

    internal sealed class ApiHost(Process process, int port) : IAsyncDisposable
    {
        private readonly Task<string> standardOutput = process.StandardOutput.ReadToEndAsync();
        private readonly Task<string> standardError = process.StandardError.ReadToEndAsync();
        public HttpClient Client { get; } = new() { BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(30) };

        public static async Task<ApiHost> StartForDatabaseAsync(string connectionString,
            IReadOnlyDictionary<string, string>? settings = null, string environment = "Development")
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            var host = new ApiHost(InitialAdminSeederTests.StartApiProcess(connectionString, [], port,
                environment: environment, additionalSettings: settings), port);
            try { await host.WaitUntilReadyAsync(); return host; }
            catch { await host.DisposeAsync(); throw; }
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput; _ = await standardError;
        }

        private async Task WaitUntilReadyAsync()
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            while (!timeout.IsCancellationRequested && !process.HasExited)
            {
                try { using var response = await Client.PostAsync("/api/auth/refresh", content: null, timeout.Token); return; }
                catch (HttpRequestException) { await Task.Delay(100, timeout.Token); }
                catch (TaskCanceledException) when (!timeout.IsCancellationRequested) { await Task.Delay(100, timeout.Token); }
            }
            var output = await Task.WhenAll(standardOutput, standardError);
            throw new InvalidOperationException($"API did not become ready. {string.Join(Environment.NewLine, output)}");
        }
    }
}
