using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Api.Common.Authentication;

/// <summary>Rejects untrusted browser requests before reading or changing cookie-authenticated state.</summary>
internal static class CookieRequestOrigin
{
    public static void EnsureAllowed(HttpRequest request, IConfiguration configuration)
    {
        var origin = request.Headers.Origin.ToString();
        if (origin == "null") throw Denied();
        var allowed = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (origin.Length > 0)
        {
            if (origin != $"{request.Scheme}://{request.Host}" && !allowed.Contains(origin, StringComparer.Ordinal))
                throw Denied();
            return;
        }
        // CLI/health probes have neither header. A browser's untrusted sibling/cross-site request must not use that exception.
        if (request.Headers["Sec-Fetch-Site"].ToString() is "cross-site" or "same-site") throw Denied();
    }

    private static ForbiddenException Denied() => new("Nguồn truy cập không được phép.");
}
