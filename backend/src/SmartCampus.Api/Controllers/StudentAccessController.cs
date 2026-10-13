using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Features.Invitations.Commands.AccessTour;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api/student/tours/{tourId:guid}")]
public sealed class StudentAccessController(ISender sender, IConfiguration configuration) : ControllerBase
{
    public sealed record JoinRequest(string AccessCode);
    [HttpPost("join")]
    [EnableRateLimiting("InvitationJoin")]
    public Task<ActionResult<BaseResponse<StudentTourInfo?>>> Join(Guid tourId, JoinRequest request, CancellationToken ct) =>
        Access(tourId, "join", request.AccessCode, ct);
    [HttpPost("session")]
    public Task<ActionResult<BaseResponse<StudentTourInfo?>>> Session(Guid tourId, CancellationToken ct) => Access(tourId, "session", null, ct);
    [HttpPost("leave")]
    public Task<ActionResult<BaseResponse<StudentTourInfo?>>> Leave(Guid tourId, CancellationToken ct) => Access(tourId, "leave", null, ct);

    private async Task<ActionResult<BaseResponse<StudentTourInfo?>>> Access(Guid tourId, string operation, string? code, CancellationToken ct)
    {
        var origin = Request.Headers.Origin.ToString();
        var allowed = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (origin.Length > 0 && origin != $"{Request.Scheme}://{Request.Host}" && !allowed.Contains(origin, StringComparer.Ordinal))
            throw new SmartCampus.Application.Common.Exceptions.ForbiddenException("Nguồn truy cập không được phép.");
        var name = "campus_tour_" + tourId.ToString("N");
        var options = new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.None,
            Path = $"/api/student/tours/{tourId:D}", IsEssential = true };
        // Register before dispatch: exception middleware may clear existing headers.
        if (operation == "leave")
            Response.OnStarting(() => { Response.Cookies.Delete(name, options); return Task.CompletedTask; });
        var result = await sender.Send(new AccessTourCommand(tourId, operation, code, Request.Cookies[name]), ct);
        if (operation != "leave" && result.Token is not null) {
            options.Expires = result.Info!.InvitationExpiresAt;
            Response.Cookies.Append(name, result.Token, options);
        }
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<StudentTourInfo?> { Success = true, Message = "OK", Data = result.Info });
    }
}
