using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);
var port = int.Parse(Environment.GetEnvironmentVariable("S1_PORT") ?? "5443");
var certificatePath = Environment.GetEnvironmentVariable("S1_CERTIFICATE")
    ?? throw new InvalidOperationException("S1_CERTIFICATE is required.");
var certificatePassword = Environment.GetEnvironmentVariable("S1_CERTIFICATE_PASSWORD")
    ?? throw new InvalidOperationException("S1_CERTIFICATE_PASSWORD is required.");

builder.WebHost.ConfigureKestrel(options => options.ListenAnyIP(port, listen =>
    listen.UseHttps(certificatePath, certificatePassword)));
builder.Services.AddSignalR().AddJsonProtocol(options =>
    options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/hubs/compatibility"))
    {
        if (context.Request.Headers.Authorization != "Bearer s1-valid")
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
    }

    await next();
});
app.MapGet("/ready", () => Results.Ok(new { ready = true }));
app.MapHub<CompatibilityHub>("/hubs/compatibility");
app.Run();

public sealed class CompatibilityHub : Hub
{
    private static readonly ConcurrentQueue<ReportStateDto> States = new();
    private static readonly ConcurrentQueue<ReportCommandResultDto> Results = new();

    public async Task<bool> ReportState(ReportStateDto report)
    {
        if (report.RobotId == Guid.Empty || report.StreamId == Guid.Empty ||
            report.Seq is < 1 or > 9_007_199_254_740_991 ||
            report.ReportedAt.Offset != TimeSpan.Zero ||
            string.IsNullOrWhiteSpace(report.MapKey) || string.IsNullOrWhiteSpace(report.FrameId))
        {
            return false;
        }

        if (report.Pose is not null && report.Pose.CapturedAt.Offset != TimeSpan.Zero)
        {
            return false;
        }

        States.Enqueue(report);
        if (report.Status == RobotStatus.NAVIGATING)
        {
            await Clients.Caller.SendAsync("DummyGoTo", new DummyGoToDto(
                Guid.Parse("33333333-3333-4333-8333-333333333333"),
                "campus-map-v1", "map", 1.25, -0.75, 1.5707963267948966, "poi-library"));
        }

        return true;
    }

    public Task<bool> RejectMalformedReportState(JsonElement payload)
    {
        if (!payload.TryGetProperty("seq", out var sequence) ||
            sequence.ValueKind != JsonValueKind.Number || !sequence.TryGetInt64(out var value) ||
            value is < 1 or > 9_007_199_254_740_991)
        {
            return Task.FromResult(false);
        }

        return Task.FromResult(true);
    }

    public Task<bool> ReportCommandResult(ReportCommandResultDto report)
    {
        if (report.LegId == Guid.Empty || report.CommandKind != CommandKind.GO_TO ||
            report.Phase is not (CommandPhase.ACCEPTED or CommandPhase.TERMINAL) ||
            (report.Phase == CommandPhase.TERMINAL && report.Outcome is null))
        {
            return Task.FromResult(false);
        }

        Results.Enqueue(report);
        return Task.FromResult(true);
    }
}

public sealed record ReportStateDto(
    Guid RobotId,
    Guid StreamId,
    long Seq,
    DateTimeOffset ReportedAt,
    string MapKey,
    string FrameId,
    PoseDto? Pose,
    RobotStatus Status,
    Guid? LegId);

public sealed record PoseDto(double X, double Y, double Yaw, DateTimeOffset CapturedAt);
public sealed record DummyGoToDto(
    Guid LegId,
    string MapKey,
    string FrameId,
    double X,
    double Y,
    double Yaw,
    string? StopId);
public sealed record ReportCommandResultDto(
    Guid LegId,
    CommandKind CommandKind,
    CommandPhase Phase,
    CommandOutcome? Outcome,
    string? Reason);

[JsonConverter(typeof(JsonStringEnumConverter<RobotStatus>))]
public enum RobotStatus { IDLE, NAVIGATING, ARRIVED, FAILED, UNKNOWN }
[JsonConverter(typeof(JsonStringEnumConverter<CommandKind>))]
public enum CommandKind { GO_TO, CANCEL }
[JsonConverter(typeof(JsonStringEnumConverter<CommandPhase>))]
public enum CommandPhase { ACCEPTED, REJECTED, TERMINAL }
[JsonConverter(typeof(JsonStringEnumConverter<CommandOutcome>))]
public enum CommandOutcome { ARRIVED, CANCELLED, FAILED }
