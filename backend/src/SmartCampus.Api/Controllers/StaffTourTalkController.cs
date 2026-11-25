using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.TourTalk;
using SmartCampus.Application.Features.TourTalk.Commands.SendStaffTalkMessage;
using SmartCampus.Application.Features.TourTalk.Queries.GetTourTalk;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// ADR-0070 Tour talk, Staff side: the Operator speaks to every Viewer (text or a recorded voice clip) and reads their
/// replies; other Staff follow the conversation read-only. Messages live in memory only.
/// </summary>
[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/tours/{id:guid}/talk")]
public sealed class StaffTourTalkController(ISender sender) : ControllerBase
{
    /// <summary>Messages after <paramref name="after"/> of <paramref name="epoch"/>; another epoch returns all kept messages.</summary>
    [HttpGet]
    public async Task<ActionResult<BaseResponse<TourTalkFeed>>> Get(Guid id, [FromQuery] Guid? epoch, [FromQuery] long after,
        CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<TourTalkFeed>
        {
            Success = true, Message = "OK",
            Data = await sender.Send(new GetStaffTourTalkQuery(id, User.GetRequiredUserId(), epoch, Math.Max(0, after)), ct)
        });
    }

    public sealed class StaffTalkForm
    {
        public string? Text { get; init; }
        public IFormFile? Audio { get; init; }
        public int? DurationMs { get; init; }
    }

    /// <summary>Multipart: <c>text</c> and/or <c>audio</c> (a recorded clip, with <c>durationMs</c>).</summary>
    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(TourTalkLimits.MaxStaffRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = TourTalkLimits.MaxStaffRequestBytes)]
    public async Task<ActionResult<BaseResponse<TourTalkMessageView>>> Send(Guid id, [FromForm] StaffTalkForm form, CancellationToken ct)
    {
        byte[]? audio = null;
        if (form.Audio is { Length: > 0 } file)
        {
            // RequestSizeLimit bounds the body; the validator refuses a clip over the audio limit.
            using var buffer = new MemoryStream();
            await file.OpenReadStream().CopyToAsync(buffer, ct);
            audio = buffer.ToArray();
        }
        var message = await sender.Send(new SendStaffTalkMessageCommand(id, User.GetRequiredUserId(), form.Text, audio,
            form.Audio?.ContentType, form.DurationMs), ct);
        return Ok(new BaseResponse<TourTalkMessageView> { Success = true, Message = "Message sent.", Data = message });
    }

    [HttpGet("{messageId:guid}/audio")]
    public async Task<IActionResult> Audio(Guid id, Guid messageId, CancellationToken ct)
    {
        var audio = await sender.Send(new GetStaffTourTalkAudioQuery(id, messageId), ct);
        Response.Headers.CacheControl = "private, max-age=3600";
        return File(audio.Content, audio.ContentType);
    }
}
