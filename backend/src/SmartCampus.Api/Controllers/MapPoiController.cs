using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class MapPoiController(ISender sender) : ControllerBase
{
    private const string StaffAndTechnical = ApplicationRoles.Staff + "," + ApplicationRoles.TechnicalStaff;

    [HttpPost("technical/map-versions")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    [RequestSizeLimit(MapPackageValidator.MaxPackageBytes + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MapPackageValidator.MaxPackageBytes + 1024 * 1024)]
    public async Task<ActionResult<BaseResponse<MapVersionView>>> UploadMap(
        [FromForm] string areaKey, [FromForm] string areaName, [FromForm] Guid requestId,
        [FromForm] IFormFile package, CancellationToken ct)
    {
        if (package is null || package.Length is <= 0 or > MapPackageValidator.MaxPackageBytes)
            throw new FluentValidation.ValidationException($"Package must be between 1 and {MapPackageValidator.MaxPackageBytes} bytes.");
        await using var input = package.OpenReadStream();
        using var output = new MemoryStream((int)package.Length);
        await input.CopyToAsync(output, ct);
        if (output.Length != package.Length || output.Length > MapPackageValidator.MaxPackageBytes)
            throw new FluentValidation.ValidationException("The uploaded map package exceeded its declared or supported size.");
        var result = await sender.Send(new CreateMapVersionCommand(User.GetRequiredUserId(),
            new(areaKey, areaName, requestId, output.ToArray())), ct);
        return Ok(new BaseResponse<MapVersionView> { Success = true, Message = "Map package validated and versioned.", Data = result });
    }

    [HttpGet("technical/map-areas")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<MapAreaOption>>>> ListMapAreas(CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<MapAreaOption>> { Success = true, Message = "Map areas retrieved.",
            Data = await sender.Send(new ListMapAreasQuery(), ct) });

    [HttpGet("technical/physical-robots")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<PhysicalRobotStatus>>>> ListPhysicalRobots(CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<PhysicalRobotStatus>> { Success = true, Message = "Physical robots retrieved.",
            Data = await sender.Send(new ListPhysicalRobotsQuery(), ct) });

    [HttpPost("technical/physical-robots")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<PhysicalRobotOption>>> RegisterPhysicalRobot(
        [FromBody] RegisterPhysicalRobotRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<PhysicalRobotOption> { Success = true, Message = "Physical robot identity registered.",
            Data = await sender.Send(new RegisterPhysicalRobotCommand(User.GetRequiredUserId(), request), ct) });

    [HttpPost("technical/physical-robots/{id:guid}/credential")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<PhysicalRobotCredentialIssue>>> IssuePhysicalRobotCredential(
        Guid id, [FromBody] IssuePhysicalRobotCredentialRequest request, CancellationToken ct) =>
        await ChangePhysicalRobotCredential(id, request, rotate: false, ct);

    [HttpPost("technical/physical-robots/{id:guid}/credential/rotate")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<PhysicalRobotCredentialIssue>>> RotatePhysicalRobotCredential(
        Guid id, [FromBody] IssuePhysicalRobotCredentialRequest request, CancellationToken ct) =>
        await ChangePhysicalRobotCredential(id, request, rotate: true, ct);

    private async Task<ActionResult<BaseResponse<PhysicalRobotCredentialIssue>>> ChangePhysicalRobotCredential(
        Guid id, IssuePhysicalRobotCredentialRequest request, bool rotate, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers.Pragma = "no-cache";
        var result = await sender.Send(new IssuePhysicalRobotCredentialCommand(
            User.GetRequiredUserId(), id, request.ExpectedRowVersion, rotate), ct);
        return Ok(new BaseResponse<PhysicalRobotCredentialIssue>
        {
            Success = true,
            Message = rotate ? "Robot credential rotated. Store this credential now; it cannot be retrieved again."
                : "Robot credential issued. Store this credential now; it cannot be retrieved again.",
            Data = result
        });
    }

    [HttpGet("maps/versions")]
    [Authorize(Roles = StaffAndTechnical)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<MapVersionListItem>>>> ListMaps(
        [FromQuery] string? areaKey, [FromQuery] int take = 50, CancellationToken ct = default) =>
        Ok(new BaseResponse<IReadOnlyList<MapVersionListItem>> { Success = true, Message = "Map versions retrieved.",
            Data = await sender.Send(new ListMapVersionsQuery(areaKey, take), ct) });

    [HttpGet("maps/versions/{id:guid}")]
    [Authorize(Roles = StaffAndTechnical)]
    public async Task<ActionResult<BaseResponse<MapVersionListItem>>> GetMap(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<MapVersionListItem> { Success = true, Message = "Map version retrieved.", Data = await sender.Send(new GetMapVersionQuery(id), ct) });

    [HttpGet("maps/versions/{id:guid}/package")]
    [Authorize(Roles = StaffAndTechnical)]
    public async Task<IActionResult> DownloadMap(Guid id, CancellationToken ct)
    {
        var package = await sender.Send(new GetMapPackageQuery(id), ct);
        Response.Headers.ETag = $"\"{package.Sha256}\"";
        return File(package.Bytes, "application/zip", package.FileName, enableRangeProcessing: false);
    }

    [HttpPost("technical/map-versions/{id:guid}/deployment-checks")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<MapDeploymentCheckView>>> RecordDeployment(
        Guid id, [FromBody] RecordMapDeploymentRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<MapDeploymentCheckView> { Success = true, Message = "Deployment check recorded.",
            Data = await sender.Send(new RecordMapDeploymentCommand(User.GetRequiredUserId(), id, request), ct) });

    [HttpGet("technical/map-versions/{id:guid}/deployment-checks")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<MapDeploymentCheckView>>>> ListDeploymentChecks(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<MapDeploymentCheckView>> { Success = true, Message = "Deployment history retrieved.",
            Data = await sender.Send(new ListMapDeploymentChecksQuery(id), ct) });

    [HttpPost("staff/poi-proposals")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<ActionResult<BaseResponse<PoiProposalView>>> CreateProposal([FromBody] CreatePoiProposalRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<PoiProposalView> { Success = true, Message = "POI proposal created as draft.",
            Data = await sender.Send(new CreatePoiProposalCommand(User.GetRequiredUserId(), request), ct) });

    [HttpGet("staff/poi-proposals")]
    [Authorize(Roles = StaffAndTechnical)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<PoiProposalView>>>> ListProposals([FromQuery] Guid? mapVersionId, CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<PoiProposalView>> { Success = true, Message = "POI proposals retrieved.",
            Data = await sender.Send(new ListPoiProposalsQuery(mapVersionId), ct) });

    [HttpGet("staff/poi-proposals/{id:guid}")]
    [Authorize(Roles = StaffAndTechnical)]
    public async Task<ActionResult<BaseResponse<PoiProposalView>>> GetProposal(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<PoiProposalView> { Success = true, Message = "POI proposal retrieved.", Data = await sender.Send(new GetPoiProposalQuery(id), ct) });

    [HttpGet("staff/poi-proposals/{id:guid}/history")]
    [Authorize(Roles = StaffAndTechnical)]
    public async Task<ActionResult<BaseResponse<PoiHistoryView>>> GetProposalHistory(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<PoiHistoryView> { Success = true, Message = "POI proposal history retrieved.", Data = await sender.Send(new GetPoiHistoryQuery(id), ct) });

    [HttpPut("staff/poi-proposals/{id:guid}/draft")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<ActionResult<BaseResponse<PoiProposalView>>> ReviseProposal(Guid id, [FromBody] CreatePoiRevisionRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<PoiProposalView> { Success = true, Message = "POI proposal revision saved as draft.",
            Data = await sender.Send(new CreatePoiRevisionCommand(User.GetRequiredUserId(), id, request), ct) });

    [HttpPost("staff/poi-proposals/{id:guid}/submit")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<ActionResult<BaseResponse<PoiProposalView>>> SubmitProposal(Guid id, [FromBody] SubmitPoiProposalRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<PoiProposalView> { Success = true, Message = "POI revision submitted for technical verification.",
            Data = await sender.Send(new SubmitPoiProposalCommand(User.GetRequiredUserId(), id, request), ct) });

    [HttpGet("technical/poi-verifications")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<PoiVerificationQueueItem>>>> VerificationQueue([FromQuery] Guid? mapVersionId, CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<PoiVerificationQueueItem>> { Success = true, Message = "Verification queue retrieved.",
            Data = await sender.Send(new ListPoiVerificationQueueQuery(mapVersionId), ct) });

    [HttpPost("technical/poi-proposals/{id:guid}/revisions/{revisionNumber:int}/verification")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<ActionResult<BaseResponse<PoiVerificationView>>> RecordVerification(
        Guid id, int revisionNumber, [FromBody] VerifyPoiProposalRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<PoiVerificationView> { Success = true, Message = "POI technical result recorded.",
            Data = await sender.Send(new RecordPoiVerificationCommand(User.GetRequiredUserId(), id, revisionNumber, request), ct) });
}
