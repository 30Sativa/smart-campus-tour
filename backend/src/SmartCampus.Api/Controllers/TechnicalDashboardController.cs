using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.RobotDiagnostics.Queries.GetRobotDiagnostics;
using SmartCampus.Application.Features.RobotDiagnostics.Queries.GetTechnicalDashboard;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.TechnicalStaff)]
[Route("api/technical")]
public sealed class TechnicalDashboardController(ISender sender) : ControllerBase
{
    [HttpGet("dashboard")]
    public async Task<ActionResult<BaseResponse<TechnicalDashboardDto>>> GetDashboard(
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(new GetTechnicalDashboardQuery(), cancellationToken);
        return Ok(new BaseResponse<TechnicalDashboardDto>
        {
            Success = true,
            Message = "Technical dashboard metrics retrieved.",
            Data = result
        });
    }

    [HttpGet("robots/{robotCode}/diagnostics")]
    public async Task<ActionResult<BaseResponse<RobotDiagnosticsDetailDto>>> GetRobotDiagnostics(
        string robotCode,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(new GetRobotDiagnosticsQuery(robotCode), cancellationToken);
        return Ok(new BaseResponse<RobotDiagnosticsDetailDto>
        {
            Success = true,
            Message = "Robot diagnostics retrieved.",
            Data = result
        });
    }
}
