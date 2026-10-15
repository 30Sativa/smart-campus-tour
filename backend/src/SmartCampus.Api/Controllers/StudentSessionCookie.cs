using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Api.Controllers;

/// <summary>Shared by the Student session and Student Q&amp;A endpoints (docs/architecture.md §3.2.3, §7.1).</summary>
internal static class StudentSessionCookie
{
    /// <summary>The per-Tour HttpOnly cookie; its path scope covers every /api/student/tours/{tourId}/... endpoint.</summary>
    public static string Name(Guid tourId) => "campus_tour_" + tourId.ToString("N");

    /// <summary>Exact browser-origin check for cookie-authenticated Student requests.</summary>
    public static void EnsureAllowedOrigin(HttpRequest request, IConfiguration configuration)
    {
        var origin = request.Headers.Origin.ToString();
        var allowed = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (origin.Length > 0 && origin != $"{request.Scheme}://{request.Host}" && !allowed.Contains(origin, StringComparer.Ordinal))
            throw new ForbiddenException("Nguồn truy cập không được phép.");
    }
}
