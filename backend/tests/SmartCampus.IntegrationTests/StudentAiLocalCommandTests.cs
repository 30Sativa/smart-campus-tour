namespace SmartCampus.IntegrationTests;

public sealed class StudentAiLocalCommandTests
{
    [Theory]
    [InlineData("Production", "localhost", false, true, "requires Development")]
    [InlineData("Development", "unreachable.invalid", false, true, "local SQL Server")]
    [InlineData("Development", "localhost", true, true, "separately")]
    [InlineData("Development", "localhost", false, false, "Configure AiAssistant:ServiceKey")]
    public async Task UnsafeLocalSetup_IsRefusedWithoutConnectingOrStartingHttp(
        string environment, string server, bool combined, bool configuredKey, string message)
    {
        var args = combined ? new[] { "--student-ai-local", "--seed-demo-pois" } : ["--student-ai-local"];
        using var process = InitialAdminSeederTests.StartApiProcess(
            $"Server={server};Database=DoNotChange;Integrated Security=true", args,
            environment: environment, additionalSettings: new Dictionary<string, string>
            { ["AiAssistant__ServiceKey"] = configuredKey ? "local-test-service-key" : "" });
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        var output = await stdout + await stderr;
        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains(message, output);
        Assert.DoesNotContain("Now listening on", output);
        Assert.DoesNotContain("unreachable.invalid", output);
        Assert.DoesNotContain("local-test-service-key", output);
    }
}
