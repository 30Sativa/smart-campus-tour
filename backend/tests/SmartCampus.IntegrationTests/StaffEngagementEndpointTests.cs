using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0071: the engagement report is Staff-only, validates its period and reports an empty one as zeros.</summary>
public sealed class StaffEngagementEndpointTests
{
    private const string Overview = "/api/staff/engagement?from=2026-11-01T00:00:00%2B07:00&to=2026-12-01T00:00:00%2B07:00";

    [SchemaV11Fact]
    public async Task StaffReadsTheReport_OtherRolesCannot_AndTheRangeIsValidated()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "engagement.staff", roles: ["STAFF"]);
        await database.InsertUserAsync(true, username: "engagement.technical", roles: ["TECHNICAL_STAFF"]);
        await database.InsertUserAsync(true, username: "engagement.admin", roles: ["ADMIN"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);

        using (var anonymous = await host.Client.GetAsync(Overview)) Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        foreach (var other in new[] { "engagement.technical", "engagement.admin" })
        {
            var token = await RepresentativeEndpointTests.LoginAsync(host.Client, other);
            using var forbidden = await Send(host.Client, token, Overview);
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        }

        var staff = await RepresentativeEndpointTests.LoginAsync(host.Client, "engagement.staff");
        using (var response = await Send(host.Client, staff, Overview))
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var data = json.RootElement.GetProperty("data");
            Assert.Equal(0, data.GetProperty("tourCount").GetInt32());
            Assert.Equal(JsonValueKind.Null, data.GetProperty("joinRate").ValueKind);
            Assert.Empty(data.GetProperty("pois").EnumerateArray());
            Assert.False(data.GetProperty("truncated").GetBoolean());
        }
        using (var reversed = await Send(host.Client, staff,
            "/api/staff/engagement?from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z"))
            Assert.Equal(HttpStatusCode.BadRequest, reversed.StatusCode);
        using (var unknown = await Send(host.Client, staff, $"/api/staff/manage/tours/{Guid.NewGuid():D}/engagement"))
            Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string token, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client.SendAsync(request);
    }
}
