using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateScheduleBlock;
using SmartCampus.Application.Features.Tours.Commands.RemoveScheduleBlock;
using SmartCampus.Application.Features.Tours.Queries.GetTourShifts;

namespace SmartCampus.Api.Controllers;

/// <summary>Admin closes a campus day or one shift of it (docs/lich-tour-theo-ca.md §5). Admin still never operates a Tour.</summary>
[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/schedule-blocks")]
public sealed class AdminScheduleBlocksController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct) =>
        Ok(new BaseResponse<TourShiftsView> { Success = true, Message = "Schedule blocks retrieved.",
            Data = await sender.Send(new GetTourShiftsQuery(from, to), ct) });

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateScheduleBlockRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<TourShiftBlockView> { Success = true, Message = "Schedule block created.",
            Data = await sender.Send(new CreateScheduleBlockCommand(User.GetRequiredUserId(), request), ct) });

    [HttpPost("{id:guid}/remove")]
    public async Task<IActionResult> Remove(Guid id, [FromBody] RemoveScheduleBlockRequest request, CancellationToken ct)
    {
        await sender.Send(new RemoveScheduleBlockCommand(id, User.GetRequiredUserId(), request), ct);
        return Ok(new BaseResponse<object?> { Success = true, Message = "Schedule block removed.", Data = null });
    }
}
