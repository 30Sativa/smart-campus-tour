using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class PoiManagementEndpointTests
{
    private const string Password = "integration-test-password";

    [SchemaV11Fact]
    public async Task PoiEndpoints_RequireAdminCreateInactiveAndReturnRelevantStatuses()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var admin = await database.InsertUserAsync(isActive: true, username: "poi.admin", roles: ["ADMIN"]);
        await database.InsertUserAsync(isActive: true, username: "poi.staff", roles: ["STAFF"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);

        using var anonymous = await host.Client.GetAsync("/api/admin/pois");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var staffToken = await GetAccessTokenAsync(host.Client, "poi.staff");
        using var staffRequest = CreateRequest(HttpMethod.Get, "/api/admin/pois", staffToken);
        using var staffResponse = await host.Client.SendAsync(staffRequest);
        Assert.Equal(HttpStatusCode.Forbidden, staffResponse.StatusCode);

        var adminToken = await GetAccessTokenAsync(host.Client, "poi.admin");
        using var listRequest = CreateRequest(HttpMethod.Get, "/api/admin/pois", adminToken);
        using var listResponse = await host.Client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);

        using var missingRequest = CreateRequest(HttpMethod.Get, $"/api/admin/pois/{Guid.NewGuid():D}", adminToken);
        using var missingResponse = await host.Client.SendAsync(missingRequest);
        Assert.Equal(HttpStatusCode.NotFound, missingResponse.StatusCode);

        using var invalidRequest = CreateJsonRequest(HttpMethod.Post, "/api/admin/pois", adminToken, CreateBody(yaw: 3.141594m));
        using var invalidResponse = await host.Client.SendAsync(invalidRequest);
        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);

        using var createRequest = CreateJsonRequest(HttpMethod.Post, "/api/admin/pois", adminToken, CreateBody(yaw: 0m));
        using var createResponse = await host.Client.SendAsync(createRequest);
        Assert.Equal(HttpStatusCode.OK, createResponse.StatusCode);
        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var poiId = createdDocument.RootElement.GetProperty("data").GetProperty("id").GetGuid();

        using var detailRequest = CreateRequest(HttpMethod.Get, $"/api/admin/pois/{poiId:D}", adminToken);
        using var detailResponse = await host.Client.SendAsync(detailRequest);
        Assert.Equal(HttpStatusCode.OK, detailResponse.StatusCode);
        using var detailDocument = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
        var details = detailDocument.RootElement.GetProperty("data");
        Assert.False(details.GetProperty("isActive").GetBoolean());
        Assert.Equal(0m, details.GetProperty("yaw").GetDecimal());
        Assert.Equal(8, Convert.FromBase64String(details.GetProperty("rowVersion").GetString()!).Length);

        await using var context = CreateContext(database.ConnectionString);
        Assert.Equal(admin.Id, context.AuditLogs.Single().ActorUserId);
        Assert.Equal("POI_CREATED", context.AuditLogs.Single().Action);
    }

    [SchemaV11Fact]
    public async Task PoiUpdates_RejectStaleVersionsAndNoOpDoesNotAddAudit_ConcurrentSameVersionHasOneConflict()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "poi.concurrent.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "poi.concurrent.admin");
        var poiId = await CreatePoiAsync(host.Client, token);
        var initial = await GetPoiAsync(host.Client, token, poiId);
        var originalVersion = initial.GetProperty("rowVersion").GetString()!;

        using var firstUpdate = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(originalVersion, name: "Updated POI"));
        using var firstResponse = await host.Client.SendAsync(firstUpdate);
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        using var staleUpdate = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(originalVersion, name: "Stale overwrite"));
        using var staleResponse = await host.Client.SendAsync(staleUpdate);
        Assert.Equal(HttpStatusCode.Conflict, staleResponse.StatusCode);

        var latest = await GetPoiAsync(host.Client, token, poiId);
        var latestVersion = latest.GetProperty("rowVersion").GetString()!;
        using var noOpUpdate = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(latestVersion, name: "Updated POI"));
        using var noOpResponse = await host.Client.SendAsync(noOpUpdate);
        Assert.Equal(HttpStatusCode.OK, noOpResponse.StatusCode);

        await using (var context = CreateContext(database.ConnectionString))
            Assert.Equal(1, await context.AuditLogs.CountAsync(audit => audit.Action == "POI_UPDATED"));

        using var firstConcurrent = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(latestVersion, name: "Concurrent A"));
        using var secondConcurrent = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(latestVersion, name: "Concurrent B"));
        var responses = await Task.WhenAll(host.Client.SendAsync(firstConcurrent), host.Client.SendAsync(secondConcurrent));
        using (responses[0])
        using (responses[1])
        {
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
            Assert.DoesNotContain(responses, response => response.StatusCode == HttpStatusCode.InternalServerError);
        }

        await using var finalContext = CreateContext(database.ConnectionString);
        Assert.Equal(2, await finalContext.AuditLogs.CountAsync(audit => audit.Action == "POI_UPDATED"));
    }

    [SchemaV11Fact]
    public async Task PoiUsageLocksPoseAfterRouteReferenceAndAllChangesWhileTourIsReady()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var admin = await database.InsertUserAsync(isActive: true, username: "poi.lock.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "poi.lock.admin");
        var poiId = await CreatePoiAsync(host.Client, token);
        var details = await GetPoiAsync(host.Client, token, poiId);
        var version = details.GetProperty("rowVersion").GetString()!;

        await InsertReadyTourUsingPoiAsync(database, admin.Id, poiId);
        using var liveTourUpdate = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(version, name: "Blocked during tour"));
        using var liveTourResponse = await host.Client.SendAsync(liveTourUpdate);
        Assert.Equal(HttpStatusCode.Conflict, liveTourResponse.StatusCode);

        using var availabilityRequest = CreateJsonRequest(HttpMethod.Post, $"/api/admin/pois/{poiId:D}/activate", token,
            new { expectedRowVersion = version });
        using var availabilityResponse = await host.Client.SendAsync(availabilityRequest);
        Assert.Equal(HttpStatusCode.Conflict, availabilityResponse.StatusCode);

        await database.ExecuteAsync("UPDATE dbo.Tours SET State='COMPLETED';");
        using var poseUpdate = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(version, name: "Content remains editable", x: 10m));
        using var poseResponse = await host.Client.SendAsync(poseUpdate);
        Assert.Equal(HttpStatusCode.Conflict, poseResponse.StatusCode);

        using var contentUpdate = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{poiId:D}", token,
            UpdateBody(version, name: "Content remains editable"));
        using var contentResponse = await host.Client.SendAsync(contentUpdate);
        Assert.Equal(HttpStatusCode.OK, contentResponse.StatusCode);
    }

    [SchemaV11Fact]
    public async Task PoiMapPickerPose_RoundTripsMapContextAndDecimalPrecision()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "poi.map.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "poi.map.admin");

        // Image (406.5, 527.5) in map2.yaml, with a +Y body heading.
        using var create = CreateJsonRequest(HttpMethod.Post, "/api/admin/pois", token,
            CreateBody(yaw: 1.570796m, x: 5.0250m, y: -5.0250m, mapKey: "map2-v1"));
        using var created = await host.Client.SendAsync(create);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        using var document = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = document.RootElement.GetProperty("data").GetProperty("id").GetGuid();
        var initial = await GetPoiAsync(host.Client, token, id);
        Assert.Equal("map2-v1", initial.GetProperty("mapKey").GetString());
        Assert.Equal("map", initial.GetProperty("mapFrame").GetString());
        Assert.Equal(5.0250m, initial.GetProperty("x").GetDecimal());
        Assert.Equal(-5.0250m, initial.GetProperty("y").GetDecimal());
        Assert.Equal(1.570796m, initial.GetProperty("yaw").GetDecimal());
        Assert.False(initial.GetProperty("isActive").GetBoolean());

        // Center of the top-left cell; preserve the API's inclusive rounded pi.
        using var update = CreateJsonRequest(HttpMethod.Put, $"/api/admin/pois/{id:D}", token,
            UpdateBody(initial.GetProperty("rowVersion").GetString()!, "Map pose updated",
                x: -15.2750m, y: 21.3250m, yaw: 3.141593m, mapKey: "map2-v1"));
        using var updated = await host.Client.SendAsync(update);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var latest = await GetPoiAsync(host.Client, token, id);
        Assert.Equal(id, latest.GetProperty("id").GetGuid());
        Assert.Equal("map2-v1", latest.GetProperty("mapKey").GetString());
        Assert.Equal("map", latest.GetProperty("mapFrame").GetString());
        Assert.Equal(-15.2750m, latest.GetProperty("x").GetDecimal());
        Assert.Equal(21.3250m, latest.GetProperty("y").GetDecimal());
        Assert.Equal(3.141593m, latest.GetProperty("yaw").GetDecimal());
        Assert.NotEqual(initial.GetProperty("rowVersion").GetString(), latest.GetProperty("rowVersion").GetString());
    }

    private static object CreateBody(decimal yaw, decimal x = 1.25m, decimal y = -2.5m, string mapKey = "campus-map-v1") => new
    {
        name = "Library",
        description = (string?)null,
        mapKey,
        mapFrame = "map",
        x,
        y,
        yaw,
        narrationText = (string?)null,
        audioUrl = (string?)null,
        narrationSeconds = (int?)null,
        fallbackVideoUrl = (string?)null
    };

    private static object UpdateBody(string expectedRowVersion, string name, decimal x = 1.25m, decimal y = -2.5m, decimal yaw = 0m, string mapKey = "campus-map-v1") => new
    {
        expectedRowVersion,
        name,
        description = (string?)null,
        mapKey,
        mapFrame = "map",
        x,
        y,
        yaw,
        narrationText = (string?)null,
        audioUrl = (string?)null,
        narrationSeconds = (int?)null,
        fallbackVideoUrl = (string?)null
    };

    private static async Task<Guid> CreatePoiAsync(HttpClient client, string token)
    {
        using var request = CreateJsonRequest(HttpMethod.Post, "/api/admin/pois", token, CreateBody(yaw: 0m));
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("data").GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> GetPoiAsync(HttpClient client, string token, Guid poiId)
    {
        using var request = CreateRequest(HttpMethod.Get, $"/api/admin/pois/{poiId:D}", token);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("data").Clone();
    }

    private static async Task InsertReadyTourUsingPoiAsync(
        InitialAdminSeederTests.EmptySchemaDatabase database,
        Guid adminId,
        Guid poiId)
    {
        var routeId = Guid.NewGuid();
        var stopId = Guid.NewGuid();
        var tourId = Guid.NewGuid();
        await database.ExecuteAsync($"""
            INSERT dbo.Routes (Id, Name, MapKey, MapFrame, StartX, StartY, StartYaw, EndMode, IsActive, CreatedAt)
            VALUES ('{routeId:D}', N'POI lock test route', N'campus-map-v1', N'map', 0, 0, 0, 'LAST_POI', 1, SYSDATETIMEOFFSET());
            INSERT dbo.RouteStops (Id, RouteId, PoiId, StopOrder, DwellSeconds, HeadStepsJson)
            VALUES ('{stopId:D}', '{routeId:D}', '{poiId:D}', 1, 30, N'[]');
            INSERT dbo.Tours (Id, Name, RouteId, ActiveRouteId, ScheduledStartAt, State, IsHeld, CreatedByUserId, CreatedAt)
            VALUES ('{tourId:D}', N'POI lock test', '{routeId:D}', '{routeId:D}', SYSDATETIMEOFFSET(), 'READY', 0, '{adminId:D}', SYSDATETIMEOFFSET());
            """);
    }

    private static async Task<string> GetAccessTokenAsync(HttpClient client, string username)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = Password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("accessToken").GetString()!;
    }

    private static HttpRequestMessage CreateRequest(HttpMethod method, string path, string token)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(HttpMethod method, string path, string token, object body)
    {
        var request = CreateRequest(method, path, token);
        request.Content = JsonContent.Create(body);
        return request;
    }

    private static ApplicationDbContext CreateContext(string connectionString) =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(connectionString).Options);

    internal sealed class ApiHost(Process process, int port) : IAsyncDisposable
    {
        private readonly Task<string> standardOutput = process.StandardOutput.ReadToEndAsync();
        private readonly Task<string> standardError = process.StandardError.ReadToEndAsync();
        public HttpClient Client { get; } = new()
        {
            BaseAddress = new Uri($"http://127.0.0.1:{port}"),
            Timeout = TimeSpan.FromSeconds(30)
        };

        public static async Task<ApiHost> StartForDatabaseAsync(string connectionString, IReadOnlyDictionary<string, string>? settings = null)
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            var host = new ApiHost(InitialAdminSeederTests.StartApiProcess(connectionString, [], port, additionalSettings: settings), port);
            try
            {
                await host.WaitUntilReadyAsync();
                return host;
            }
            catch
            {
                await host.DisposeAsync();
                throw;
            }
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput;
            _ = await standardError;
        }

        private async Task WaitUntilReadyAsync()
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            while (!timeout.IsCancellationRequested && !process.HasExited)
            {
                try
                {
                    using var response = await Client.PostAsync("/api/auth/refresh", content: null, timeout.Token);
                    return;
                }
                catch (HttpRequestException)
                {
                    await Task.Delay(100, timeout.Token);
                }
                catch (TaskCanceledException) when (!timeout.IsCancellationRequested)
                {
                    await Task.Delay(100, timeout.Token);
                }
            }

            var output = await Task.WhenAll(standardOutput, standardError);
            throw new InvalidOperationException($"API did not become ready. {string.Join(Environment.NewLine, output)}");
        }
    }
}
