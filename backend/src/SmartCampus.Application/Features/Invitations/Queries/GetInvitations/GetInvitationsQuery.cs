using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Invitations.Queries.GetInvitations;

public sealed record GetInvitationsQuery(Guid RegistrationId, Guid? Owner) : IQuery<InvitationDetails>;
public sealed class GetInvitationsQueryHandler(IInvitationRepository repository, InvitationSettings settings, TimeProvider clock)
    : IRequestHandler<GetInvitationsQuery, InvitationDetails>
{
    public async Task<InvitationDetails> Handle(GetInvitationsQuery query, CancellationToken ct)
    {
        var read = await repository.ReadAsync(query.RegistrationId, query.Owner, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var now = clock.GetUtcNow();
        var items = read.Invitations.OrderBy(i => i.RosterRow.RowNumber).Select(i => {
            var latest = read.Audits.LastOrDefault(a => a.EntityId == i.Id.ToString("D") && a.Action == InvitationAudit.Requested);
            var result = latest is null ? null : read.Audits.LastOrDefault(a => a.CorrelationId == latest.CorrelationId && a.Action == InvitationAudit.Result);
            var send = settings.Enabled && InvitationPolicy.CanSend(read.Tour, read.Registration, i, now);
            var cooldown = latest is null || latest.OccurredAt.AddSeconds(60) <= now;
            return new InvitationItem(i.Id, i.RosterRow.RowNumber, i.RosterRow.RowType, i.RosterRow.DisplayName, i.RosterRow.Email,
                Convert.ToBase64String(i.RowVersion), i.AccessVersion, i.ExpiresAt, i.RevokedAt,
                result?.ResultCode ?? (latest is null ? "NOT_REQUESTED" : "PENDING"), latest?.OccurredAt,
                send && cooldown, settings.Enabled && cooldown && InvitationPolicy.CanReissue(read.Tour, read.Registration, i, now),
                settings.Enabled && InvitationPolicy.CanRevoke(read.Tour, read.Registration, i, now));
        }).ToArray();
        var missing = read.Registration.RosterRows.Any(r => r.IsActive && read.Invitations.All(i => i.RosterRowId != r.Id));
        return new(settings.Enabled, settings.Enabled && read.Registration.State == "APPROVED" &&
            read.Tour.State is "SCHEDULED" or "READY" or "RUNNING" && missing &&
            read.Tour.ScheduledStartAt.AddHours(settings.ExpiryHoursAfterStart) > now, items);
    }
}
