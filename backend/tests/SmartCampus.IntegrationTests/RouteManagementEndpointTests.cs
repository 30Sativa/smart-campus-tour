using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class RouteManagementEndpointTests
{
    [SchemaV11Fact]
    public async Task Crud_UsesSql_ReordersWithoutUniqueCollisions_AndAuditsDelete()
    {
        await using var fixture = await Fixture.Create();
        var id = await fixture.CreateRoute();
        var before = await fixture.Get(id);
        Assert.False(before.IsActive);
        Assert.Empty(before.ConfigurationIssues);
        Assert.Equal([1, 2, 3], before.Stops.Select(s => s.StopOrder));
        var reversed = fixture.Input() with { Name = "Updated", Stops = fixture.Input().Stops.Reverse().ToArray(),
            EndMode = "POSE", EndX = 1.2345m, EndY = -2m, EndYaw = 3.141593m };
        await fixture.Send(HttpMethod.Put, id.ToString(), new { expectedVersion = before.Version, configuration = reversed }, HttpStatusCode.OK);
        var after = await fixture.Get(id);
        Assert.Equal(reversed.Stops.Select(s => s.PoiId), after.Stops.Select(s => s.PoiId));
        Assert.Equal(1.2345m, after.EndX);
        Assert.NotEqual(before.Version, after.Version);
        await fixture.Send(HttpMethod.Post, $"{id}/activate", new { expectedVersion = after.Version }, HttpStatusCode.OK);
        after = await fixture.Get(id);
        Assert.True(after.IsActive);
        await fixture.Send(HttpMethod.Post, $"{id}/deactivate", new { expectedVersion = after.Version }, HttpStatusCode.OK);
        after = await fixture.Get(id);
        await fixture.Send(HttpMethod.Delete, id.ToString(), new { expectedVersion = after.Version }, HttpStatusCode.OK);
        await fixture.Send(HttpMethod.Get, id.ToString(), null, HttpStatusCode.NotFound);
        await using var db = fixture.Context();
        Assert.Empty(await db.Routes.ToListAsync());
        Assert.Empty(await db.RouteStops.ToListAsync());
        Assert.Equal(3, await db.Pois.CountAsync());
        Assert.Equal(["ROUTE_CREATED", "ROUTE_UPDATED", "ROUTE_ACTIVATED", "ROUTE_DEACTIVATED", "ROUTE_DELETED"],
            await db.AuditLogs.OrderBy(a => a.Id).Select(a => a.Action).ToArrayAsync());
        Assert.All(await db.AuditLogs.ToListAsync(), log => Assert.Equal(fixture.AdminId, log.ActorUserId));
    }

    [SchemaV11Fact]
    public async Task AuthorizationPaginationAndInvalidConfiguration_AreEnforcedByHttp()
    {
        await using var fixture = await Fixture.Create();
        using var anonymous = new HttpClient { BaseAddress = fixture.Client.BaseAddress };
        using var denied = await anonymous.GetAsync("/api/admin/routes");
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        var adminToken = await Fixture.Token(anonymous, "route.systemadmin");
        anonymous.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
        {
            using var request = new HttpRequestMessage(method, method == HttpMethod.Post || method == HttpMethod.Get ? "/api/admin/routes" : $"/api/admin/routes/{Guid.NewGuid()}")
                { Content = JsonContent.Create(fixture.Input()) };
            using var response = await anonymous.SendAsync(request);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
        await fixture.Send(HttpMethod.Get, "?size=101", null, HttpStatusCode.BadRequest);
        await fixture.Send(HttpMethod.Get, "?page=0", null, HttpStatusCode.BadRequest);
        var valid = fixture.Input();
        var invalid = new[]
        {
            valid with { Stops = [] },
            valid with { Stops = [valid.Stops[0], valid.Stops[0]] },
            valid with { MapKey = "OTHER-MAP" },
            valid with { MapFrame = "odom" },
            valid with { Stops = [valid.Stops[0] with { PoiId = Guid.NewGuid() }] },
            valid with { Stops = [valid.Stops[0] with { DwellSeconds = 0 }] },
            valid with { Stops = [valid.Stops[0] with { HeadSteps = [new("RIGHT", 31)] }] },
            valid with { EndMode = "POSE" },
            valid with { EndX = 1 },
            valid with { StartYaw = 3.141594m }
        };
        foreach (var input in invalid) await fixture.Send(HttpMethod.Post, "", input, HttpStatusCode.BadRequest);
        await using var db = fixture.Context();
        Assert.Empty(await db.Routes.ToListAsync());
        Assert.Empty(await db.AuditLogs.ToListAsync());
        await fixture.CreateRoute();
        using var list = await fixture.Send(HttpMethod.Get, "?search=Route&size=1", null, HttpStatusCode.OK);
        var page = await list.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, page.GetProperty("pagination").GetProperty("totalItems").GetInt32());
        Assert.Single(page.GetProperty("data").EnumerateArray());
    }

    [SchemaV11Fact]
    public async Task StaleAndConcurrentEdits_HaveOneWinner_AndNoOpDoesNotAudit()
    {
        await using var fixture = await Fixture.Create();
        var id = await fixture.CreateRoute();
        var before = await fixture.Get(id);
        await fixture.Send(HttpMethod.Put, id.ToString(), new { expectedVersion = before.Version, configuration = fixture.Input() }, HttpStatusCode.OK);
        Assert.Equal(before.Version, (await fixture.Get(id)).Version);
        var responses = await Task.WhenAll("AB".Select(name => fixture.Client.PutAsJsonAsync($"/api/admin/routes/{id}",
            new { expectedVersion = before.Version, configuration = fixture.Input() with { Name = name.ToString() } })));
        foreach (var response in responses) response.Dispose();
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        await fixture.Send(HttpMethod.Delete, id.ToString(), new { expectedVersion = before.Version }, HttpStatusCode.Conflict);
        await using var db = fixture.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "ROUTE_UPDATED"));
        Assert.Equal(3, await db.RouteStops.CountAsync());
    }

    [SchemaV11Fact]
    public async Task EveryTourState_FreezesItinerary_AndLiveStatesAlsoLockMetadataAndAvailability()
    {
        await using var fixture = await Fixture.Create();
        var id = await fixture.CreateRoute();
        var detail = await fixture.Get(id);
        var stopIds = detail.Stops.Select(s => s.Id).ToArray();
        await fixture.InsertTour(id, "SCHEDULED");
        foreach (var state in new[] { "SCHEDULED", "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            await fixture.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='{state}';");
            detail = await fixture.Get(id);
            Assert.False(detail.Usage.CanEditConfiguration);
            Assert.False(detail.Usage.CanDelete);
            var live = state is "READY" or "RUNNING";
            Assert.Equal(!live, detail.Usage.CanEditMetadataAndAvailability);
            await fixture.Send(HttpMethod.Put, id.ToString(), new { expectedVersion = detail.Version,
                configuration = fixture.Input() with { Stops = fixture.Input().Stops.Reverse().ToArray() } }, HttpStatusCode.Conflict);
            await fixture.Send(HttpMethod.Delete, id.ToString(), new { expectedVersion = detail.Version }, HttpStatusCode.Conflict);
            await fixture.Send(HttpMethod.Post, $"{id}/deactivate", new { expectedVersion = detail.Version }, live ? HttpStatusCode.Conflict : HttpStatusCode.OK);
            await fixture.Send(HttpMethod.Put, id.ToString(), new { expectedVersion = detail.Version,
                configuration = fixture.Input() with { Description = state } }, live ? HttpStatusCode.Conflict : HttpStatusCode.OK);
            Assert.Equal(stopIds, (await fixture.Get(id)).Stops.Select(s => s.Id));
        }
    }

    [SchemaV11Fact]
    public async Task VariantsPreserveStopIdentities_AndEnabledBranchProtectsRunningTour()
    {
        await using var fixture = await Fixture.Create();
        var baseId = await fixture.CreateRoute();
        var branchId = await fixture.CreateRoute();
        var baseRoute = await fixture.Get(baseId);
        var branch = await fixture.Get(branchId);
        var variant = Guid.NewGuid();
        await fixture.Database.ExecuteAsync($"""
            INSERT dbo.RouteVariants (Id, BaseRouteId, BranchPointRouteStopId, VariantRouteId, VariantBranchStopId, Name, IsActive, CreatedAt)
            VALUES ('{variant}', '{baseId}', '{baseRoute.Stops[0].Id}', '{branchId}', '{branch.Stops[0].Id}', N'Existing variant', 0, SYSDATETIMEOFFSET());
            """);
        foreach (var route in new[] { baseRoute, branch })
        {
            Assert.False((await fixture.Get(route.Id)).Usage.CanEditConfiguration);
            await fixture.Send(HttpMethod.Delete, route.Id.ToString(), new { expectedVersion = route.Version }, HttpStatusCode.Conflict);
        }
        var tour = await fixture.InsertTour(baseId, "RUNNING");
        await fixture.Database.ExecuteAsync($"""
            INSERT dbo.TourAllowedBranches (Id, TourId, RouteVariantId, IsEnabled, CreatedAt)
            VALUES ('{Guid.NewGuid()}', '{tour}', '{variant}', 1, SYSDATETIMEOFFSET());
            """);
        branch = await fixture.Get(branchId);
        Assert.True(branch.Usage.HasReadyOrRunningTours);
        await fixture.Send(HttpMethod.Post, $"{branchId}/deactivate", new { expectedVersion = branch.Version }, HttpStatusCode.Conflict);
    }

    [SchemaV11Fact]
    public async Task InactivePoiIsAllowedInDraft_ActivationRechecksCurrentPoiMapAndAvailability()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Database.ExecuteAsync($"UPDATE dbo.Pois SET IsActive=0 WHERE Id='{fixture.PoiIds[0]}';");
        var id = await fixture.CreateRoute();
        var route = await fixture.Get(id);
        Assert.Empty(route.ConfigurationIssues);
        Assert.Contains("POI_INACTIVE", route.AvailabilityIssues);
        await fixture.Send(HttpMethod.Post, $"{id}/activate", new { expectedVersion = route.Version }, HttpStatusCode.BadRequest);
        await fixture.Database.ExecuteAsync($"UPDATE dbo.Pois SET IsActive=1, MapFrame=N'odom' WHERE Id='{fixture.PoiIds[0]}';");
        await fixture.Send(HttpMethod.Post, $"{id}/activate", new { expectedVersion = route.Version }, HttpStatusCode.BadRequest);
        Assert.False((await fixture.Get(id)).IsActive);
    }

    [SchemaV11Fact]
    public async Task AuditFailure_RollsBackDeletedStopsAndRouteUpdate()
    {
        await using var fixture = await Fixture.Create();
        var id = await fixture.CreateRoute();
        var before = await fixture.Get(id);
        await fixture.Database.ExecuteAsync("""
            CREATE TRIGGER dbo.RejectRouteAudit ON dbo.AuditLogs AFTER INSERT AS
            BEGIN
              IF EXISTS (SELECT 1 FROM inserted WHERE Action='ROUTE_UPDATED')
                THROW 51000, 'Test audit failure', 1;
            END;
            """);
        await fixture.Send(HttpMethod.Put, id.ToString(), new { expectedVersion = before.Version,
            configuration = fixture.Input() with { Stops = fixture.Input().Stops.Reverse().ToArray() } }, HttpStatusCode.InternalServerError);
        var after = await fixture.Get(id);
        Assert.Equal(before.Version, after.Version);
        Assert.Equal(before.Stops.Select(s => s.Id), after.Stops.Select(s => s.Id));
        await using var db = fixture.Context();
        Assert.Single(await db.AuditLogs.ToListAsync());
    }

    [SchemaV11Fact]
    public async Task PoiMapUpdateRacingRouteCreation_IsObservedBeforeRouteCanCommit()
    {
        await using var fixture = await Fixture.Create();
        await using var connection = new SqlConnection(fixture.Database.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        await using var command = new SqlCommand("UPDATE dbo.Pois SET MapKey=N'new-map' WHERE Id=@id", connection, transaction);
        command.Parameters.AddWithValue("@id", fixture.PoiIds[0]);
        await command.ExecuteNonQueryAsync();
        // The Route must wait for the concurrent map writer, then validate the committed map.
        var creating = fixture.Client.PostAsJsonAsync("/api/admin/routes", fixture.Input());
        await Task.WhenAny(creating, Task.Delay(200));
        Assert.False(creating.IsCompleted);
        await transaction.CommitAsync();
        using var response = await creating;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var db = fixture.Context();
        Assert.Empty(await db.Routes.ToListAsync());
        Assert.Empty(await db.RouteStops.ToListAsync());
        Assert.Empty(await db.AuditLogs.ToListAsync());
    }

    [SchemaV11Fact]
    public async Task HistoricalEventAndDirectExecutionStopReferences_AlsoProtectOtherRoutes()
    {
        await using var fixture = await Fixture.Create();
        var baseId = await fixture.CreateRoute();
        var historyId = await fixture.CreateRoute();
        var executionId = await fixture.CreateRoute();
        var tour = await fixture.InsertTour(baseId, "COMPLETED");
        var history = await fixture.Get(historyId);
        var execution = await fixture.Get(executionId);
        await using (var db = fixture.Context())
        {
            db.TourEvents.Add(new TourEvent { TourId = tour, RouteId = historyId,
                EventType = "TEST_HISTORY", OccurredAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        await fixture.Database.ExecuteAsync($"UPDATE dbo.Tours SET LastArrivedRouteStopId='{execution.Stops[0].Id}' WHERE Id='{tour}';");
        foreach (var route in new[] { history, execution })
        {
            Assert.True((await fixture.Get(route.Id)).Usage.HasReferences);
            await fixture.Send(HttpMethod.Delete, route.Id.ToString(), new { expectedVersion = route.Version }, HttpStatusCode.Conflict);
        }
    }

    private sealed class Fixture(InitialAdminSeederTests.EmptySchemaDatabase database,
        PoiManagementEndpointTests.ApiHost host, Guid adminId, Guid[] poiIds) : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public HttpClient Client => host.Client;
        public Guid AdminId => adminId;
        public Guid[] PoiIds => poiIds;
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);
        public RouteInput Input() => new("Route", null, "test-map", "map", 0, 0, 0, "LAST_POI", null, null, null,
            poiIds.Select(id => new RouteStopInput(id, 30, [new("FRONT", 30)])).ToArray());

        public static async Task<Fixture> Create()
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            try
            {
                var admin = await database.InsertUserAsync(isActive: true, username: "route.admin", roles: ["STAFF"]);
                await database.InsertUserAsync(isActive: true, username: "route.systemadmin", roles: ["ADMIN"]);
                var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
                var fixture = new Fixture(database, host, admin.Id, [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()]);
                host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Token(host.Client, "route.admin"));
                await using var db = fixture.Context();
                db.Pois.AddRange(fixture.PoiIds.Select((id, i) => new Poi { Id = id, Name = $"POI {i + 1}", MapKey = "test-map", MapFrame = "map", IsActive = true, CreatedAt = DateTimeOffset.UtcNow }));
                await db.SaveChangesAsync();
                return fixture;
            }
            catch { await database.DisposeAsync(); throw; }
        }

        public async Task<Guid> CreateRoute()
        {
            using var response = await Send(HttpMethod.Post, "", Input(), HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            return body.GetProperty("data").GetProperty("id").GetGuid();
        }
        public async Task<RouteDetails> Get(Guid id)
        {
            using var response = await Send(HttpMethod.Get, id.ToString(), null, HttpStatusCode.OK);
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            return json.GetProperty("data").Deserialize<RouteDetails>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        }
        public async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? body, HttpStatusCode expected)
        {
            using var request = new HttpRequestMessage(method, $"/api/admin/routes{(path.Length == 0 || path.StartsWith('?') ? "" : "/")}{path}");
            if (body is not null) request.Content = JsonContent.Create(body);
            var response = await Client.SendAsync(request);
            Assert.True(response.StatusCode == expected, $"{method} {path}: expected {expected}, got {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            return response;
        }
        public async Task<Guid> InsertTour(Guid route, string state)
        {
            var id = Guid.NewGuid();
            await database.ExecuteAsync($"""
                INSERT dbo.Tours (Id, Name, RouteId, ActiveRouteId, ScheduledStartAt, State, IsHeld, CreatedByUserId, CreatedAt)
                VALUES ('{id}', N'Test Tour', '{route}', '{route}', SYSDATETIMEOFFSET(), '{state}', 0, '{adminId}', SYSDATETIMEOFFSET());
                """);
            return id;
        }
        public static async Task<string> Token(HttpClient client, string username)
        {
            using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = "integration-test-password" });
            response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
        }
        public async ValueTask DisposeAsync() { await host.DisposeAsync(); await database.DisposeAsync(); }
    }
}
