using MediatR;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Features.StreamRelay;
using SmartCampus.Application.Features.StudentTour;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.Api.Controllers;

/// <summary>Route and progress for the invited Student page (docs/architecture.md §3.2.3). Student session cookie only.</summary>
[ApiController]
[Route("api/student/tours/{tourId:guid}")]
public sealed class StudentTourController(ISender sender, IConfiguration configuration) : ControllerBase
{
    [HttpGet("view")]
    public async Task<ActionResult<BaseResponse<StudentTourView>>> View(Guid tourId, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var view = await sender.Send(new GetStudentTourViewQuery(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)]), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<StudentTourView> { Success = true, Message = "OK", Data = view });
    }

    public sealed record VoteRequest(Guid StopVisitId, Guid StopId);

    /// <summary>ADR-0065: the Viewer's vote for the next POI, one per roster row per ballot; returns the ballot.</summary>
    [HttpPut("vote")]
    public async Task<ActionResult<BaseResponse<TourBallotView>>> Vote(Guid tourId, VoteRequest request, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var ballot = await sender.Send(new CastStudentVoteCommand(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)],
            request.StopVisitId, request.StopId), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<TourBallotView> { Success = true, Message = "OK", Data = ballot });
    }

    /// <summary>ADR-0055: the relay URL and a short-lived token for this session; the page asks again before it expires.</summary>
    [HttpGet("stream-access")]
    public async Task<ActionResult<BaseResponse<StreamAccess>>> StreamAccess(Guid tourId, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var access = await sender.Send(new GetStudentStreamAccessQuery(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)]), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<StreamAccess> { Success = true, Message = "OK", Data = access });
    }

    /// <summary>ADR-0063: the relay URL and a short-lived token for the Tour's fallback video, while the Tour runs.</summary>
    [HttpGet("fallback-access")]
    public async Task<ActionResult<BaseResponse<StreamAccess>>> FallbackAccess(Guid tourId, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var access = await sender.Send(new GetStudentFallbackAccessQuery(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)]), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<StreamAccess> { Success = true, Message = "OK", Data = access });
    }
}
