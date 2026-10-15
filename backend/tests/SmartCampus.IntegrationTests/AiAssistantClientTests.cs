using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Infrastructure.Integrations.Assistant;

namespace SmartCampus.IntegrationTests;

public sealed class AiAssistantClientTests
{
    private const string Key = "integration-test-service-key";

    private static AiAssistantConfiguration Config(string? baseUrl, string? key = Key) =>
        new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AiAssistant:BaseUrl"] = baseUrl,
            ["AiAssistant:ServiceKey"] = key
        }).Build());

    private static HttpAiAssistantClient Client(AiAssistantConfiguration config, TimeSpan? timeout = null) =>
        new(new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(10) }, config, NullLogger<HttpAiAssistantClient>.Instance);

    private static AssistantQuestion Question(AssistantPoi? poi = null) =>
        new(Guid.NewGuid(), "Robot dùng cảm biến gì?", [new AssistantTurn("Robot là gì?", "Là AMR.")], poi);

    [Fact]
    public async Task Answer_SendsTheContractBodyWithServiceKey_AndMapsTheReply()
    {
        await using var server = new FakeAssistantServer();
        var poi = new AssistantPoi(Guid.NewGuid(), "AI Lab", "Phòng lab", null);
        var answer = await Client(Config(server.BaseUrl)).AnswerAsync(Question(poi), CancellationToken.None);

        Assert.Equal(new AssistantAnswer("Robot dùng LiDAR.", false), answer);
        var (path, authorization, body) = Assert.Single(server.Requests);
        Assert.Equal("/v1/answer", path);
        Assert.Equal("Bearer " + Key, authorization);
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        Assert.Equal(new[] { "requestId", "question", "recentTurns", "poi", "language" },
            root.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal("Robot dùng cảm biến gì?", root.GetProperty("question").GetString());
        Assert.Equal("vi", root.GetProperty("language").GetString());
        Assert.Equal("Robot là gì?", root.GetProperty("recentTurns")[0].GetProperty("question").GetString());
        Assert.Equal("AI Lab", root.GetProperty("poi").GetProperty("name").GetString());
        Assert.True(root.GetProperty("poi").TryGetProperty("narrationText", out _));
    }

    [Fact]
    public async Task Answer_SendsNullPoiForGeneralContext()
    {
        await using var server = new FakeAssistantServer();
        await Client(Config(server.BaseUrl)).AnswerAsync(Question(), CancellationToken.None);
        using var json = JsonDocument.Parse(Assert.Single(server.Requests).Body);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("poi").ValueKind);
    }

    [Theory]
    [InlineData(503, "AI_UNAVAILABLE")]
    [InlineData(401, "AI_UNAVAILABLE")]
    [InlineData(400, "AI_UNAVAILABLE")]
    [InlineData(500, "AI_UNAVAILABLE")]
    public async Task Answer_MapsAssistantErrorsToUnavailable(int status, string code)
    {
        await using var server = new FakeAssistantServer { Status = status, ResponseBody = """{"error":"x"}""" };
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            Client(Config(server.BaseUrl)).AnswerAsync(Question(), CancellationToken.None));
        Assert.Equal(code, error.Code);
    }

    [Fact]
    public async Task Answer_MapsAssistantTimeoutAndSlowAssistant_ToGatewayTimeout()
    {
        await using var gateway = new FakeAssistantServer { Status = 504, ResponseBody = """{"error":"timeout"}""" };
        Assert.Equal("AI_TIMEOUT", (await Assert.ThrowsAsync<GatewayTimeoutException>(() =>
            Client(Config(gateway.BaseUrl)).AnswerAsync(Question(), CancellationToken.None))).Code);

        await using var slow = new FakeAssistantServer { Delay = TimeSpan.FromSeconds(5) };
        Assert.Equal("AI_TIMEOUT", (await Assert.ThrowsAsync<GatewayTimeoutException>(() =>
            Client(Config(slow.BaseUrl), TimeSpan.FromMilliseconds(300)).AnswerAsync(Question(), CancellationToken.None))).Code);
    }

    [Theory]
    [InlineData("""{"answer":"","outOfScope":false}""")]
    [InlineData("""not json""")]
    public async Task Answer_UnusableBody_IsUnavailable(string body)
    {
        await using var server = new FakeAssistantServer { ResponseBody = body };
        await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            Client(Config(server.BaseUrl)).AnswerAsync(Question(), CancellationToken.None));
    }

    [Fact]
    public async Task Answer_UnconfiguredOrUnreachable_IsUnavailable()
    {
        await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            Client(Config(null)).AnswerAsync(Question(), CancellationToken.None));

        using var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var closedPort = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            Client(Config($"http://127.0.0.1:{closedPort}")).AnswerAsync(Question(), CancellationToken.None));
    }

    [Theory]
    [InlineData("not a url", Key)]
    [InlineData("ftp://assistant.internal", Key)]
    [InlineData("http://user:pass@assistant.internal", Key)]
    [InlineData("http://assistant.internal", "short")]
    [InlineData("http://assistant.internal", null)]
    public void Configuration_RejectsUnsafeValues(string baseUrl, string? key)
    {
        Assert.Throws<InvalidOperationException>(() => Config(baseUrl, key));
    }

    [Fact]
    public void Configuration_IsOptIn()
    {
        Assert.False(Config(null).Enabled);
        Assert.False(Config("   ").Enabled);
        var config = Config("http://127.0.0.1:8090/");
        Assert.True(config.Enabled);
        Assert.Equal(new Uri("http://127.0.0.1:8090/v1/answer"), new Uri(config.BaseUrl!, "v1/answer"));
    }
}
