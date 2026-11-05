using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.RobotDiagnostics.Commands.IngestRobotDiagnostics;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api/fleet/v1/diagnostics")]
[Authorize(AuthenticationSchemes = FleetRobotAuthentication.Scheme)]
public sealed class FleetDiagnosticsController(ISender sender) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(32 * 1024)]
    [EnableRateLimiting("FleetSync")]
    public async Task<ActionResult<BaseResponse<IngestRobotDiagnosticsResult>>> ReportDiagnostics(
        [FromBody] RobotDiagnosticsReport request,
        CancellationToken cancellationToken)
    {
        if (!HttpContext.Items.TryGetValue(FleetRobotAuthentication.RequestProofItemKey, out var proofValue) ||
            proofValue is not FleetRobotAuthenticationProof proof)
            throw new InvalidOperationException("Authenticated Fleet Robot proof was unavailable for this request.");

        var result = await sender.Send(new IngestRobotDiagnostics(proof.Identity, request), cancellationToken);

        return Ok(new BaseResponse<IngestRobotDiagnosticsResult>
        {
            Success = true,
            Message = "Robot diagnostics ingested successfully.",
            Data = result
        });
    }
}
