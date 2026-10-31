using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.AuditLogs;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/system-audit-logs")]
public sealed class AdminAuditLogsController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<AuditLogEntry>>> List([FromQuery] string? action, [FromQuery] string? actor,
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] int page = 1, [FromQuery] int size = 20, CancellationToken ct = default)
    {
        var result = await sender.Send(new ListAuditLogsQuery(new(action, actor, from, to, page, size)), ct);
        return Ok(new PagedResponse<AuditLogEntry> { Success = true, Message = "Audit log entries retrieved.", Data = result.Items,
            Pagination = new PaginationMetadata(result.Page, result.PageSize, result.TotalItems, result.TotalPages) });
    }
}
