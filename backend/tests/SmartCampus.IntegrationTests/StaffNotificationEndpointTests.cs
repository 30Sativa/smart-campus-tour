using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

public sealed class StaffNotificationEndpointTests
{
    private const string Path = "/api/staff/notifications";

    [SchemaV11Fact]
    public async Task StaffReadsNewestTechnicalOutcomesOnly_WithoutRawData_AndOtherRolesCannot()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var staff = await database.InsertUserAsync(true, username: "bell.staff", roles: ["STAFF"]);
        var technical = await database.InsertUserAsync(true, username: "bell.technical", roles: ["TECHNICAL_STAFF"]);
        await database.InsertUserAsync(true, username: "bell.admin", roles: ["ADMIN"]);
        var robotId = Guid.NewGuid();
        var missingRevision = Guid.NewGuid();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
            VALUES('{robotId:D}',N'amr-bell','EMULATOR',0x01,0,0,SYSDATETIMEOFFSET());
            INSERT dbo.AuditLogs(ActorUserId,RobotId,Action,EntityType,EntityId,ResultCode,DataJson,OccurredAt) VALUES
            ('{staff.Id:D}',NULL,N'TOUR_CREATED',N'Tour',N'tour-a',N'SUCCESS',NULL,'2026-11-10T03:00:00+00:00'),
            ('{technical.Id:D}','{robotId:D}',N'ROBOT_INSPECTION_RELEASED',N'Robot',N'{robotId:D}',N'SUCCESS',N'secret-marker','2026-11-10T02:00:00+00:00'),
            ('{technical.Id:D}','{robotId:D}',N'POI_TECHNICAL_REJECTED',N'PoiProposalRevision',N'{missingRevision:D}',N'FAIL',NULL,'2026-11-10T01:00:00+00:00');
            """);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        using (var anonymous = await host.Client.GetAsync(Path)) Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        foreach (var other in new[] { "bell.technical", "bell.admin" })
        {
            var token = await RepresentativeEndpointTests.LoginAsync(host.Client, other);
            using var forbidden = await Send(host.Client, token, "");
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        }

        var staffToken = await RepresentativeEndpointTests.LoginAsync(host.Client, "bell.staff");
        using var response = await Send(host.Client, staffToken, "");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("secret-marker", body, StringComparison.Ordinal);
        Assert.DoesNotContain("dataJson", body, StringComparison.OrdinalIgnoreCase);
        using var json = JsonDocument.Parse(body);
        var rows = json.RootElement.GetProperty("data");
        Assert.Equal(new[] { "ROBOT_INSPECTION_RELEASED", "POI_TECHNICAL_REJECTED" },
            rows.EnumerateArray().Select(row => row.GetProperty("action").GetString()));
        Assert.Equal(robotId, rows[0].GetProperty("targetId").GetGuid());
        Assert.Equal("amr-bell", rows[0].GetProperty("subject").GetString());
        Assert.Equal(technical.FullName, rows[0].GetProperty("actorName").GetString());
        // A revision that is gone is still news, just without a name or a link.
        Assert.Equal(JsonValueKind.Null, rows[1].GetProperty("targetId").ValueKind);
        Assert.Equal("FAIL", rows[1].GetProperty("resultCode").GetString());

        using var newest = await Send(host.Client, staffToken, "?size=1");
        using var newestJson = JsonDocument.Parse(await newest.Content.ReadAsStringAsync());
        Assert.Single(newestJson.RootElement.GetProperty("data").EnumerateArray());
        using (var tooLarge = await Send(host.Client, staffToken, "?size=51")) Assert.Equal(HttpStatusCode.BadRequest, tooLarge.StatusCode);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string token, string query)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Path + query);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client.SendAsync(request);
    }
}
