using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Infrastructure;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/infrastructure")]
public sealed class AdminInfrastructureController(ISender sender) : ControllerBase
{
    [HttpGet("health")]
    public async Task<ActionResult<BaseResponse<InfrastructureHealthDto>>> GetHealth(
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(new GetInfrastructureHealthQuery(), cancellationToken);
        return Ok(new BaseResponse<InfrastructureHealthDto>
        {
            Success = true,
            Message = "Infrastructure health metrics retrieved.",
            Data = result
        });
    }
}
