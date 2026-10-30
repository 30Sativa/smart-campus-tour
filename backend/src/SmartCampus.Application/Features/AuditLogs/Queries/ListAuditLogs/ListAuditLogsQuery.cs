using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.AuditLogs;

public sealed record AuditLogEntry(long Id, DateTimeOffset OccurredAt, string Action, string EntityType, string EntityId,
    Guid? ActorUserId, string? ActorName, Guid? TourId, string? TourName, string? RobotCode, string? ResultCode);
public sealed record AuditLogFilter(string? Action, string? Actor, DateTimeOffset? From, DateTimeOffset? To, int Page, int Size);
public sealed record ListAuditLogsQuery(AuditLogFilter Filter) : IQuery<PagedResult<AuditLogEntry>>;

public sealed class ListAuditLogsQueryValidator : AbstractValidator<ListAuditLogsQuery>
{
    public ListAuditLogsQueryValidator()
    {
        RuleFor(query => query.Filter.Action).MaximumLength(64);
        RuleFor(query => query.Filter.Actor).MaximumLength(100);
        RuleFor(query => query.Filter.Page).InclusiveBetween(1, 100_000);
        RuleFor(query => query.Filter.Size).InclusiveBetween(1, 100);
        RuleFor(query => query.Filter).Must(filter => !filter.From.HasValue || !filter.To.HasValue || filter.From <= filter.To)
            .WithMessage("From must be less than or equal to To.");
    }
}

public sealed class ListAuditLogsQueryHandler(IAuditLogReader reader)
    : IRequestHandler<ListAuditLogsQuery, PagedResult<AuditLogEntry>>
{
    public Task<PagedResult<AuditLogEntry>> Handle(ListAuditLogsQuery query, CancellationToken ct) =>
        reader.ListAsync(query.Filter, ct);
}
