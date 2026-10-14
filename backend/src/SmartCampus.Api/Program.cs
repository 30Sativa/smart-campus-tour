using SmartCampus.Api;
using SmartCampus.Application;
using SmartCampus.Api.ExceptionHandling;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Api.Hubs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.Threading.RateLimiting;

var studentAiLocal = args.Contains(StudentAiLocalCommand.Argument, StringComparer.Ordinal);
var registrationLocal = args.Contains(RegistrationLocalCommand.Argument, StringComparer.Ordinal);
var initialAdminSeedCommand = InitialAdminSeedCommand.Parse(args.Where(argument => argument != StudentAiLocalCommand.Argument && argument != RegistrationLocalCommand.Argument).ToArray());
var demoPoiSeedCommand = DemoPoiSeedCommand.Parse(initialAdminSeedCommand.GetHostArguments());
var builder = WebApplication.CreateBuilder(demoPoiSeedCommand.GetHostArguments());
if (studentAiLocal || registrationLocal)
{
    try
    {
        if (initialAdminSeedCommand.Requested || demoPoiSeedCommand.Requested || (studentAiLocal && registrationLocal))
            throw new StudentAiLocalSetupException("Run local setup separately from other seed commands.");
        if (registrationLocal) await RegistrationLocalCommand.PrepareAsync(builder);
        else await StudentAiLocalCommand.PrepareAsync(builder);
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
    // Student private Q&A (docs/architecture.md §7.1): opt-in via AiAssistant:BaseUrl, validated at startup.
    builder.Services.AddSingleton(new SmartCampus.Infrastructure.Integrations.Assistant.AiAssistantConfiguration(builder.Configuration));
    builder.Services.AddHttpClient<SmartCampus.Application.Common.Abstractions.Assistant.IAiAssistantClient,
        SmartCampus.Infrastructure.Integrations.Assistant.HttpAiAssistantClient>(client =>
        client.Timeout = TimeSpan.FromSeconds(20));
}

// The opt-in Gazebo preview is isolated in Hubs/SimulationPreviewExtensions.cs.
builder.Services.AddSimulationPreview();

// Register HTTP endpoints, error responses, and the development API document.
builder.Services.AddControllers().UseBaseResponseForInvalidModelState();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
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

app.UseExceptionHandler();

// Expose API documentation only in Development.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
        options.SwaggerEndpoint("/openapi/v1.json", "SmartCampus API v1"));
}

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

app.MapControllers();

app.Run();

static string RequireInitialAdminSeedSetting(string? value, string key)
{
    if (string.IsNullOrWhiteSpace(value))
        throw new InvalidOperationException($"Required initial-admin seed setting '{key}' is missing or blank.");

    return value;
}
