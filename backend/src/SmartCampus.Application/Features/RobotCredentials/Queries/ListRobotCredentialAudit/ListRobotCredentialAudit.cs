using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.RobotCredentials;

public sealed record ListRobotCredentialAuditQuery(
    string? Action, string? RobotCode, Guid? ActorUserId,
    DateTimeOffset? From, DateTimeOffset? To, int Page)
    : IQuery<PagedResult<RobotCredentialAuditEntry>>;

public sealed class ListRobotCredentialAuditQueryValidator
    : AbstractValidator<ListRobotCredentialAuditQuery>
{
    public ListRobotCredentialAuditQueryValidator()
    {
        RuleFor(query => query.Action).Must(action => action is null ||
            action is "ROBOT_CREDENTIAL_ISSUED" or "ROBOT_CREDENTIAL_ROTATED" or "ROBOT_CREDENTIAL_REVOKED");
        RuleFor(query => query.RobotCode).MaximumLength(100);
        RuleFor(query => query.Page).GreaterThanOrEqualTo(1);
        RuleFor(query => query.Page).LessThanOrEqualTo(100_000);
        RuleFor(query => query).Must(query => !query.From.HasValue || !query.To.HasValue || query.From <= query.To)
            .WithMessage("From must be less than or equal to To.");
    }
}

public sealed class ListRobotCredentialAuditQueryHandler(IPhysicalRobotCredentialManager manager)
    : IRequestHandler<ListRobotCredentialAuditQuery, PagedResult<RobotCredentialAuditEntry>>
{
    public Task<PagedResult<RobotCredentialAuditEntry>> Handle(ListRobotCredentialAuditQuery query, CancellationToken ct) =>
        manager.ListAuditAsync(new RobotCredentialAuditFilter(query.Action,
            string.IsNullOrWhiteSpace(query.RobotCode) ? null : query.RobotCode.Trim(),
            query.ActorUserId, query.From, query.To, query.Page), ct);
}
