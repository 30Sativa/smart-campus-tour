using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

public sealed class AuditLogEndpointTests
{
    private const string Path = "/api/admin/system-audit-logs";

    [SchemaV11Fact]
    public async Task AdminReadsFilteredLogWithoutRawData_AndOtherRolesCannot()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var admin = await database.InsertUserAsync(true, username: "audit.admin", roles: ["ADMIN"]);
        var staff = await database.InsertUserAsync(true, username: "audit.staff", roles: ["STAFF"]);
        await database.ExecuteAsync($"""
            INSERT dbo.AuditLogs(ActorUserId,Action,EntityType,EntityId,ResultCode,DataJson,OccurredAt) VALUES
            ('{staff.Id:D}',N'TOUR_CREATED',N'Tour',N'tour-a',N'SUCCESS',N'secret-marker','2026-10-20T01:00:00+00:00'),
            ('{admin.Id:D}',N'ACCOUNT_CREATED',N'User',N'user-a',N'SUCCESS',NULL,'2026-10-21T01:00:00+00:00'),
            (NULL,N'INVITATION_ENTERED',N'Invitation',N'invitation-a',N'SUCCESS',NULL,'2026-10-22T01:00:00+00:00');
            """);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        using (var anonymous = await host.Client.GetAsync(Path)) Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        var staffToken = await RepresentativeEndpointTests.LoginAsync(host.Client, "audit.staff");
        var adminToken = await RepresentativeEndpointTests.LoginAsync(host.Client, "audit.admin");
        using (var forbidden = await Send(host.Client, staffToken, "")) Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        using var all = await Send(host.Client, adminToken, "");
        var allBody = await all.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, all.StatusCode);
        Assert.DoesNotContain("secret-marker", allBody, StringComparison.Ordinal);
        Assert.DoesNotContain("dataJson", allBody, StringComparison.OrdinalIgnoreCase);
        using var allJson = JsonDocument.Parse(allBody);
        var rows = allJson.RootElement.GetProperty("data");
        Assert.Equal(new[] { "INVITATION_ENTERED", "ACCOUNT_CREATED", "TOUR_CREATED" },
            rows.EnumerateArray().Select(row => row.GetProperty("action").GetString()));
        Assert.Equal(JsonValueKind.Null, rows[0].GetProperty("actorName").ValueKind);
        Assert.Equal(3, allJson.RootElement.GetProperty("pagination").GetProperty("totalItems").GetInt32());

        using var byAction = await Send(host.Client, adminToken, "?action=TOUR_CREATED");
        using var byActionJson = JsonDocument.Parse(await byAction.Content.ReadAsStringAsync());
        Assert.Equal("tour-a", Assert.Single(byActionJson.RootElement.GetProperty("data").EnumerateArray()).GetProperty("entityId").GetString());
        using var byActor = await Send(host.Client, adminToken, "?actor=audit.admin");
        using var byActorJson = JsonDocument.Parse(await byActor.Content.ReadAsStringAsync());
        Assert.Equal("user-a", Assert.Single(byActorJson.RootElement.GetProperty("data").EnumerateArray()).GetProperty("entityId").GetString());
        using var byTime = await Send(host.Client, adminToken, "?from=2026-10-21T12:00:00Z");
        using var byTimeJson = JsonDocument.Parse(await byTime.Content.ReadAsStringAsync());
        Assert.Equal("invitation-a", Assert.Single(byTimeJson.RootElement.GetProperty("data").EnumerateArray()).GetProperty("entityId").GetString());

        using (var tooLarge = await Send(host.Client, adminToken, "?size=101")) Assert.Equal(HttpStatusCode.BadRequest, tooLarge.StatusCode);
        using (var reversed = await Send(host.Client, adminToken, "?from=2026-10-22T00:00:00Z&to=2026-10-21T00:00:00Z"))
            Assert.Equal(HttpStatusCode.BadRequest, reversed.StatusCode);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string token, string query)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Path + query);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client.SendAsync(request);
    }
}
