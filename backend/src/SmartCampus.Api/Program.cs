using SmartCampus.Application;
using SmartCampus.Api.ExceptionHandling;
using SmartCampus.Infrastructure;
using SmartCampus.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);
var simulationPreviewEnabled = builder.Environment.IsDevelopment() &&
    builder.Configuration.GetValue<bool>("SimulationPreview:Enabled");

// Register application services and the selected persistence provider.
builder.Services.AddApplication();
if (!simulationPreviewEnabled)
    builder.Services.AddInfrastructure(builder.Configuration);

// The opt-in Gazebo preview is isolated in Hubs/SimulationPreviewExtensions.cs.
builder.Services.AddSimulationPreview();

// Register HTTP endpoints, error responses, and the development API document.
builder.Services.AddControllers();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

var app = builder.Build();

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

// Applies preview-only loopback/origin checks and maps its Hub when enabled.
app.UseSimulationPreview(simulationPreviewEnabled);

app.MapControllers();

app.Run();
