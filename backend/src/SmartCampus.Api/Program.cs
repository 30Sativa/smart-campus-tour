using SmartCampus.Api;
using SmartCampus.Api.ApiDocumentation;
using SmartCampus.Application;
using SmartCampus.Api.ExceptionHandling;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Api.Hubs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication;
using System.Threading.RateLimiting;

var fleetProvisioning = FleetRobotProvisionCommand.Parse(args);
if (fleetProvisioning.Error is not null)
{
    Console.Error.WriteLine(fleetProvisioning.Error);
    Environment.ExitCode = 2;
    return;
}

var hostArguments = fleetProvisioning.HostArguments;
var studentAiLocal = hostArguments.Contains(StudentAiLocalCommand.Argument, StringComparer.Ordinal);
var registrationLocal = hostArguments.Contains(RegistrationLocalCommand.Argument, StringComparer.Ordinal);
var reuseStudentAi = hostArguments.Contains(LocalFixtureDatabase.ReuseStudentAi, StringComparer.Ordinal);
var reuseRegistration = hostArguments.Contains(LocalFixtureDatabase.ReuseRegistration, StringComparer.Ordinal);
var localRealEmail = hostArguments.Contains(LocalFixtureDatabase.RealEmail, StringComparer.Ordinal);
var localArguments = new[] { StudentAiLocalCommand.Argument, RegistrationLocalCommand.Argument,
    LocalFixtureDatabase.ReuseStudentAi, LocalFixtureDatabase.ReuseRegistration, LocalFixtureDatabase.RealEmail };
var initialAdminSeedCommand = InitialAdminSeedCommand.Parse(hostArguments.Where(argument => !localArguments.Contains(argument, StringComparer.Ordinal)).ToArray());
var demoPoiSeedCommand = DemoPoiSeedCommand.Parse(initialAdminSeedCommand.GetHostArguments());
var builder = WebApplication.CreateBuilder(fleetProvisioning.Requested ? [] : demoPoiSeedCommand.GetHostArguments());
if (fleetProvisioning.Requested)
{
    Environment.ExitCode = await FleetRobotProvisionCommand.RunAsync(builder.Configuration, fleetProvisioning.RobotCode!);
    return;
}
if (studentAiLocal || registrationLocal || reuseStudentAi || reuseRegistration || localRealEmail)
{
    try
    {
        if (initialAdminSeedCommand.Requested || demoPoiSeedCommand.Requested ||
            new[] { studentAiLocal, registrationLocal, reuseStudentAi, reuseRegistration }.Count(value => value) != 1)
            throw new StudentAiLocalSetupException("Run local setup separately from other seed commands.");
        if (localRealEmail && !registrationLocal && !reuseRegistration)
            throw new StudentAiLocalSetupException("Real email requires the local registration fixture.");
        if (registrationLocal || reuseRegistration)
        {
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Invitations:EmailWorkerEnabled"] = localRealEmail ? "true" : "false"
            });
            if (!localRealEmail)
                builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Resend:ApiKey"] = "local-disabled-email-worker",
                    ["Resend:From"] = "CampusTour <noreply@example.test>"
                });
        }
        if (registrationLocal) await RegistrationLocalCommand.PrepareAsync(builder);
        else if (studentAiLocal) await StudentAiLocalCommand.PrepareAsync(builder);
        else LocalFixtureDatabase.Validate(builder,
            reuseStudentAi ? StudentAiLocalCommand.DatabasePrefix : RegistrationLocalCommand.DatabasePrefix, reuse: true);
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine(exception is StudentAiLocalSetupException ? exception.Message
            : $"Local setup failed ({exception.GetType().Name}). Check local SQL Server access, schema and filesystem permissions.");
        Environment.ExitCode = 1;
        return;
    }
}
if (demoPoiSeedCommand.Requested)
{
    Environment.ExitCode = await demoPoiSeedCommand.RunAsync(builder, initialAdminSeedCommand.Requested);
    return;
}

var simulationPreviewEnabled = builder.Environment.IsDevelopment() &&
    builder.Configuration.GetValue<bool>("SimulationPreview:Enabled");

// Validate authentication configuration before the normal HTTP host starts.
// The explicit seed command and isolated preview mode do not use HTTP auth.
if (!initialAdminSeedCommand.Requested && !simulationPreviewEnabled)
    _ = new JwtTokenSettings(builder.Configuration).CreateSigningKey();

// Register application services and the selected persistence provider.
builder.Services.AddApplication();
if (initialAdminSeedCommand.Requested || !simulationPreviewEnabled)
    builder.Services.AddInfrastructure(builder.Configuration);
if (!initialAdminSeedCommand.Requested && !simulationPreviewEnabled)
{
    builder.Services.AddHttpClient<SmartCampus.Application.Common.Abstractions.Invitations.IInvitationEmailSender,
        SmartCampus.Infrastructure.Integrations.Invitations.ResendInvitationEmailSender>(client =>
        client.Timeout = TimeSpan.FromSeconds(20));
    if (builder.Configuration.GetValue<bool?>("Invitations:EmailWorkerEnabled") != false)
        builder.Services.AddHostedService<SmartCampus.Api.Invitations.InvitationEmailWorker>();
}
if (initialAdminSeedCommand.Requested || !simulationPreviewEnabled)
{
    // Application handlers are validated during bootstrap too; registering the
    // optional client does not send requests or enable Student Q&A.
    // Student private Q&A (docs/architecture.md §7.1): opt-in via AiAssistant:BaseUrl, validated at startup.
    builder.Services.AddSingleton(new SmartCampus.Infrastructure.Integrations.Assistant.AiAssistantConfiguration(builder.Configuration));
    builder.Services.AddHttpClient<SmartCampus.Application.Common.Abstractions.Assistant.IAiAssistantClient,
        SmartCampus.Infrastructure.Integrations.Assistant.HttpAiAssistantClient>(client =>
        client.Timeout = TimeSpan.FromSeconds(20));
}

// The opt-in Gazebo preview is isolated in Hubs/SimulationPreviewExtensions.cs.
builder.Services.AddSimulationPreview();
if (!simulationPreviewEnabled)
    builder.Services.AddFleetSync(builder.Configuration);

// Register HTTP endpoints, error responses, and the opt-in API document.
builder.Services.AddControllers().UseBaseResponseForInvalidModelState();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddApiDocumentation(simulationPreviewEnabled);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, ct) => await context.HttpContext.Response.WriteAsJsonAsync(
        new SmartCampus.Api.Common.Responses.BaseResponse<object> {
            Success = false, Message = "Bạn đã thử quá nhiều lần. Đợi một phút rồi thử lại.",
            Errors = new { code = "RATE_LIMITED" }
        }, ct);
    options.AddPolicy("InvitationJoin", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("AccountLogin", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    var fleetSyncPermitLimit = builder.Configuration.GetValue<int?>("FleetSync:RateLimit:PermitLimit") ?? 600;
    var fleetSyncWindowSeconds = builder.Configuration.GetValue<int?>("FleetSync:RateLimit:WindowSeconds") ?? 60;
    if (fleetSyncPermitLimit <= 0 || fleetSyncWindowSeconds <= 0)
        throw new InvalidOperationException("FleetSync rate-limit permit limit and window must be positive.");
    options.AddPolicy("FleetSync", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = fleetSyncPermitLimit, Window = TimeSpan.FromSeconds(fleetSyncWindowSeconds), QueueLimit = 0 }));
});
builder.Services.AddCors(options => options.AddPolicy("WebClient", policy =>
{
    var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
    if (allowedOrigins.Length == 0)
    {
        policy.SetIsOriginAllowed(_ => false);
        return;
    }

    policy.WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
}));
if (!initialAdminSeedCommand.Requested && !simulationPreviewEnabled)
{
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new JwtTokenSettings(builder.Configuration)
                .CreateValidationParameters();
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    if (context.Request.Path.StartsWithSegments(FleetSyncExtensions.FleetSyncHubPath) &&
                        context.Request.Query.TryGetValue("access_token", out var accessToken))
                        context.Token = accessToken;
                    return Task.CompletedTask;
                }
            };
        });
    builder.Services.AddAuthorization();
}

await using var app = builder.Build();

if (initialAdminSeedCommand.Requested)
{
    var username = RequireInitialAdminSeedSetting(builder.Configuration["InitialAdminSeed:Username"], "InitialAdminSeed:Username");
    var password = RequireInitialAdminSeedSetting(builder.Configuration["InitialAdminSeed:Password"], "InitialAdminSeed:Password");
    var fullName = RequireInitialAdminSeedSetting(builder.Configuration["InitialAdminSeed:FullName"], "InitialAdminSeed:FullName");

    try
    {
        await using var scope = app.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider
            .GetRequiredService<InitialAdminSeeder>()
            .SeedAsync(username, password, fullName);

        Console.WriteLine(result == InitialAdminSeedResult.Created
            ? "Initial Admin seeded."
            : "Initial Admin already exists; skipped.");
    }
    catch (InitialAdminSeedConflictException exception)
    {
        Console.Error.WriteLine($"Initial Admin seed conflict: {exception.Message}");
        Environment.ExitCode = 1;
    }

    return;
}

// Development serves API documentation by default; elsewhere it is opt-in and
// requires its own Basic credential (backend/docs/api-documentation.md).
var apiDocumentation = ApiDocumentationSettings.Load(app.Configuration, app.Environment);

app.UseExceptionHandler();
app.UseApiDocumentation(apiDocumentation);

// The local Gazebo preview uses HTTP; other API runs redirect to HTTPS.
if (!simulationPreviewEnabled)
    app.UseHttpsRedirection();

app.UseCors("WebClient");
app.UseRateLimiter();
if (!simulationPreviewEnabled)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// Applies preview-only loopback/origin checks and maps its Hub when enabled.
app.UseSimulationPreview(simulationPreviewEnabled);
if (simulationPreviewEnabled)
{
    app.Use(async (context, next) =>
    {
        if (context.Request.Path.StartsWithSegments("/api/fleet") ||
            context.Request.Path.StartsWithSegments(FleetSyncExtensions.FleetSyncHubPath))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        await next();
    });
}

if (!simulationPreviewEnabled)
{
    app.MapGet("/health/live", () => Results.NoContent())
        .AllowAnonymous();
    app.MapGet("/health/ready", async (ApplicationDbContext db, CancellationToken cancellationToken) =>
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            return await db.Database.CanConnectAsync(timeout.Token)
                ? Results.Ok(new { status = "ready" })
                : Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
        catch (Exception)
        {
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
    }).AllowAnonymous();
}

app.MapControllers();
if (!simulationPreviewEnabled)
    app.MapFleetOperations();

app.Run();

static string RequireInitialAdminSeedSetting(string? value, string key)
{
    if (string.IsNullOrWhiteSpace(value))
        throw new InvalidOperationException($"Required initial-admin seed setting '{key}' is missing or blank.");

    return value;
}
