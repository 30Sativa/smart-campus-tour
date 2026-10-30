using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.AuditLogs;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Read side of the append-only audit log; it projects safe columns only and never returns DataJson.</summary>
public interface IAuditLogReader
{
    Task<PagedResult<AuditLogEntry>> ListAsync(AuditLogFilter filter, CancellationToken ct);
}
