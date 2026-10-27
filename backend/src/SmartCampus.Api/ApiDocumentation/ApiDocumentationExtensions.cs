using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi;

namespace SmartCampus.Api.ApiDocumentation;

// Opt-in OpenAPI document and Swagger UI. Outside Development the pages are
// served only behind a shared Basic credential; business API authentication,
// authorization, CORS and rate limiting are not involved.
// See backend/docs/api-documentation.md.
public sealed class ApiDocumentationSettings
{
    public const string DocumentPath = "/openapi/v1.json";
    private const string UiPath = "/swagger";
    private const string OpenApiPath = "/openapi";
    private const int MinimumPasswordLength = 16;

    private readonly byte[]? usernameHash;
    private readonly byte[]? passwordHash;

    private ApiDocumentationSettings(bool enabled, string? username, string? password)
    {
        Enabled = enabled;
        if (username is not null && password is not null)
        {
            usernameHash = SHA256.HashData(Encoding.UTF8.GetBytes(username));
            passwordHash = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        }
    }

    public bool Enabled { get; }
    public bool RequiresCredential => passwordHash is not null;

    public static ApiDocumentationSettings Load(IConfiguration configuration, IHostEnvironment environment)
    {
        var enabled = configuration.GetValue<bool?>("ApiDocumentation:Enabled") ?? environment.IsDevelopment();
        var username = configuration["ApiDocumentation:Username"];
        var password = configuration["ApiDocumentation:Password"];
        if (string.IsNullOrEmpty(username) && string.IsNullOrEmpty(password))
        {
            if (enabled && !environment.IsDevelopment())
                throw new InvalidOperationException(
                    "ApiDocumentation:Username and ApiDocumentation:Password are required to enable API documentation outside Development.");
            return new ApiDocumentationSettings(enabled, null, null);
        }

        if (string.IsNullOrWhiteSpace(username) || username.Contains(':'))
            throw new InvalidOperationException("ApiDocumentation:Username must be non-blank and must not contain ':'.");
        if (string.IsNullOrEmpty(password) || password.Length < MinimumPasswordLength)
            throw new InvalidOperationException(
                $"ApiDocumentation:Password must contain at least {MinimumPasswordLength} characters.");
        return new ApiDocumentationSettings(enabled, username, password);
    }

    internal static bool IsDocumentationPath(PathString path) =>
        path.StartsWithSegments(UiPath) || path.StartsWithSegments(OpenApiPath);

    internal bool Accepts(string? authorization)
    {
        if (!AuthenticationHeaderValue.TryParse(authorization, out var header) ||
            !string.Equals(header.Scheme, "Basic", StringComparison.OrdinalIgnoreCase) ||
            header.Parameter is null)
            return false;

        string credential;
        try
        {
            credential = Encoding.UTF8.GetString(Convert.FromBase64String(header.Parameter));
        }
        catch (FormatException)
        {
            return false;
        }

        var separator = credential.IndexOf(':');
        if (separator < 0) return false;
        // Compare fixed-length hashes so neither length nor prefix is observable.
        var usernameMatches = CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(credential[..separator])), usernameHash);
        var passwordMatches = CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(credential[(separator + 1)..])), passwordHash);
        return usernameMatches & passwordMatches;
    }
}

public static class ApiDocumentationExtensions
{
    private const string BearerSchemeName = "Bearer";

    public static IServiceCollection AddApiDocumentation(this IServiceCollection services, bool simulationPreviewEnabled)
    {
        services.AddOpenApi(options =>
        {
            // The preview controller is always mapped but answers 404 unless the preview runs.
            options.ShouldInclude = description => simulationPreviewEnabled ||
                description.RelativePath?.StartsWith("api/simulation", StringComparison.OrdinalIgnoreCase) != true;
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
                document.Components.SecuritySchemes[BearerSchemeName] = new OpenApiSecurityScheme
                {
                    Type = SecuritySchemeType.Http,
                    Scheme = "bearer",
                    BearerFormat = "JWT",
                    Description = "accessToken returned by POST /api/auth/login."
                };
                return Task.CompletedTask;
            });
            // Describe the user JWT only where the endpoint actually requires it,
            // so Swagger UI sends the token to those operations alone.
            options.AddOperationTransformer((operation, context, _) =>
            {
                var metadata = context.Description.ActionDescriptor.EndpointMetadata;
                var authorize = metadata.OfType<IAuthorizeData>().ToArray();
                if (authorize.Length > 0 && !metadata.OfType<IAllowAnonymous>().Any() &&
                    !authorize.Any(data => !string.IsNullOrEmpty(data.AuthenticationSchemes) &&
                        data.AuthenticationSchemes != JwtBearerDefaults.AuthenticationScheme))
                {
                    operation.Security ??= [];
                    operation.Security.Add(new OpenApiSecurityRequirement
                    {
                        [new OpenApiSecuritySchemeReference(BearerSchemeName, context.Document)] = []
                    });
                }

                if (ApiOperationDocumentation.TryGet(context.Description.ActionDescriptor, context.Description.RelativePath, out var details))
                {
                    operation.Summary = details.Summary;
                    operation.Description = details.Description;
                    operation.Tags = new HashSet<OpenApiTagReference>
                    {
                        new(details.Tag, context.Document)
                    };
                }
                else if (ApiOperationDocumentation.TryGetInfrastructureEndpoint(context.Description.RelativePath, out details))
                {
                    operation.Summary = details.Summary;
                    operation.Description = details.Description;
                    operation.Tags = new HashSet<OpenApiTagReference>
                    {
                        new(details.Tag, context.Document)
                    };
                }
                return Task.CompletedTask;
            });
        });
        return services;
    }

    public static WebApplication UseApiDocumentation(this WebApplication app, ApiDocumentationSettings settings)
    {
        if (!settings.Enabled) return app;

        if (settings.RequiresCredential)
        {
            app.UseWhen(context => ApiDocumentationSettings.IsDocumentationPath(context.Request.Path), branch =>
                branch.Use(async (context, next) =>
                {
                    if (!settings.Accepts(context.Request.Headers.Authorization))
                    {
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        context.Response.Headers.WWWAuthenticate =
                            "Basic realm=\"SmartCampus API documentation\", charset=\"UTF-8\"";
                        return;
                    }
                    await next();
                }));
        }

        app.MapOpenApi();
        app.UseSwaggerUI(options =>
            options.SwaggerEndpoint(ApiDocumentationSettings.DocumentPath, "SmartCampus API v1"));
        return app;
    }
}
