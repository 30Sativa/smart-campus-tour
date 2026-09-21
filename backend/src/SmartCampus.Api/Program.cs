using SmartCampus.Application;
using SmartCampus.Api.ExceptionHandling;
using SmartCampus.Infrastructure;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Features.Simulation;

var builder = WebApplication.CreateBuilder(args);
var simulationPreview = builder.Environment.IsDevelopment() &&
    builder.Configuration.GetValue<bool>("SimulationPreview:Enabled");
var previewOrigins = new[] { "http://localhost:5173", "http://127.0.0.1:5173" };

// Add services to the container.

builder.Services.AddApplication();
if (!simulationPreview) builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddSignalR();
builder.Services.AddSingleton<SimulationBroadcaster>();
builder.Services.AddSingleton<ISimulationPosePublisher>(services => services.GetRequiredService<SimulationBroadcaster>());
builder.Services.AddCors(options => options.AddPolicy("SimulationPreview", policy =>
    policy.WithOrigins(previewOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

builder.Services.AddControllers();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseExceptionHandler();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!simulationPreview) app.UseHttpsRedirection();

// This unauthenticated, read-only preview is explicit opt-in and never a
// production telemetry endpoint. Docker exposes its port on host loopback only.
app.Use(async (context, next) =>
{
    var ingestion = context.Request.Path.StartsWithSegments("/api/simulation");
    var preview = ingestion || context.Request.Path.StartsWithSegments("/hubs/simulation");
    if (preview)
    {
        if (!SimulationPreviewAccess.IsAllowed(simulationPreview, app.Environment.IsDevelopment(),
                ingestion, context.Connection.RemoteIpAddress))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        var origin = context.Request.Headers.Origin.ToString();
        if (origin.Length > 0 && !previewOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next(context);
});
app.UseCors("SimulationPreview");

app.MapControllers();
if (simulationPreview) app.MapHub<SimulationHub>("/hubs/simulation");

app.Run();
