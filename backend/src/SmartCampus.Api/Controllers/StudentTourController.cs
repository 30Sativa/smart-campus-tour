using MediatR;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Features.StudentTour;

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
}
