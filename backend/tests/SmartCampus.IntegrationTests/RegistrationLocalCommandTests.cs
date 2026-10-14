namespace SmartCampus.IntegrationTests;

public sealed class RegistrationLocalCommandTests
{
    [Theory]
    [InlineData("Production", "localhost", true, "requires Development")]
    [InlineData("Development", "unreachable.invalid", true, "local SQL Server")]
    [InlineData("Development", "localhost", false, "Configure Resend")]
    public async Task UnsafeSetup_IsRefusedBeforeDatabaseOrEmailAccess(
        string environment, string server, bool configuredSender, string message)
    {
        using var process = InitialAdminSeederTests.StartApiProcess(
            $"Server={server};Database=DoNotChange;Integrated Security=true", ["--registration-local"],
            environment: environment, additionalSettings: new Dictionary<string, string>
            { ["Resend__ApiKey"] = configuredSender ? "test-key-never-sent" : "", ["Resend__From"] = "test@example.test" });
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        var output = await stdout + await stderr;
        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains(message, output);
        Assert.DoesNotContain("Now listening on", output);
        Assert.DoesNotContain("test-key-never-sent", output);
        Assert.DoesNotContain("unreachable.invalid", output);
    }
}
