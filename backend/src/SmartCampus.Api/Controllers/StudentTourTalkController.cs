using MediatR;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Features.TourTalk;
using SmartCampus.Application.Features.TourTalk.Commands.SendViewerTalkMessage;
using SmartCampus.Application.Features.TourTalk.Queries.GetTourTalk;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// ADR-0070 Tour talk, Viewer side: the Operator's messages and voice clips, and the Viewer's own text replies, which
/// only Staff read. Student session cookie only, with the same origin check as the other Student calls.
/// </summary>
[ApiController]
[Route("api/student/tours/{tourId:guid}/talk")]
public sealed class StudentTourTalkController(ISender sender, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<BaseResponse<TourTalkFeed>>> Get(Guid tourId, [FromQuery] Guid? epoch, [FromQuery] long after,
        CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var feed = await sender.Send(new GetViewerTourTalkQuery(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)], epoch,
            Math.Max(0, after)), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<TourTalkFeed> { Success = true, Message = "OK", Data = feed });
    }

    public sealed record TalkRequest(string Text);

    [HttpPost]
    [RequestSizeLimit(8 * 1024)]
    public async Task<ActionResult<BaseResponse<TourTalkMessageView>>> Send(Guid tourId, TalkRequest request, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var message = await sender.Send(new SendViewerTalkMessageCommand(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)],
            request.Text), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<TourTalkMessageView> { Success = true, Message = "OK", Data = message });
    }

    [HttpGet("{messageId:guid}/audio")]
    public async Task<IActionResult> Audio(Guid tourId, Guid messageId, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var audio = await sender.Send(new GetViewerTourTalkAudioQuery(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)],
            messageId), ct);
        Response.Headers.CacheControl = "private, no-store";
        return File(audio.Content, audio.ContentType);
    }
}
