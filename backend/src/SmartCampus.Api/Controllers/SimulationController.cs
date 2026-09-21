using MediatR;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Application.Features.Simulation;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api/simulation")]
public sealed class SimulationController(ISender sender) : ControllerBase
{
    [HttpPost("pose")]
    [RequestSizeLimit(4096)]
    public async Task<IActionResult> Publish(SimulationPose pose, CancellationToken cancellationToken)
    {
        await sender.Send(new PublishPose(pose), cancellationToken);
        return NoContent();
    }
}
