using System.Text.Json;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;

public sealed class CorrectRosterEmailCommandHandler(IRegistrationRepository registrations, IInvitationRepository invitations,
    InvitationSettings settings, InvitationIssuer issuer, TimeProvider clock) : IRequestHandler<CorrectRosterEmailCommand, Unit>
{
    public const string AuditAction = "ROSTER_EMAIL_CORRECTED";

    public async Task<Unit> Handle(CorrectRosterEmailCommand command, CancellationToken ct)
    {
        var (tour, registration) = await registrations.LockRegistrationAsync(command.RegistrationId, owner: null, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var row = registration.RosterRows.SingleOrDefault(r => r.Id == command.RosterRowId && r.IsActive)
            ?? throw new NotFoundException("Không tìm thấy dòng roster đang hoạt động.");
        var request = command.Request;
        var email = RegistrationEmail.Normalize(request.Email);
        // Receipt contains only opaque snapshot tokens. Never copy email/name/code to append-only audit.
        var snapshot = JsonSerializer.Serialize(new { registrationId = registration.Id, request.ExpectedRowVersion,
            request.ExpectedTourRowVersion, request.ExpectedRosterRowVersion, request.ExpectedInvitationRowVersion });
        var previous = await registrations.FindEmailCorrectionAsync(tour.Id, request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.ActorUserId != command.ActorUserId || previous.EntityId != row.Id.ToString("D") ||
                previous.DataJson != snapshot || RegistrationEmail.Normalize(row.Email) != email ||
                await registrations.HasLaterEmailCorrectionAsync(tour.Id, row.Id, previous.Id, ct))
                throw new ConflictException("Yêu cầu đã được xử lý với dữ liệu khác hoặc email đã đổi tiếp. Tải lại để kiểm tra.", "IDEMPOTENCY_CONFLICT");
            return Unit.Value;
        }
        RowVersionToken.EnsureCurrent(tour.RowVersion, request.ExpectedTourRowVersion);
        RowVersionToken.EnsureCurrent(registration.RowVersion, request.ExpectedRowVersion);
        RowVersionToken.EnsureCurrent(row.RowVersion, request.ExpectedRosterRowVersion);
        EmailCorrectionPolicy.Evaluate(tour.State, registration.State,
            await registrations.HasInvitationsAsync(registration.Id, ct), settings.Enabled).EnsureAllowed();
        if (registration.State != RegistrationStates.Approved && request.ExpectedInvitationRowVersion is not null)
            StaleInvitation();
        if (RegistrationEmail.Normalize(row.Email) == email)
            throw new ConflictException("Email mới phải khác email hiện tại.", "EMAIL_UNCHANGED");
        if (registration.RosterRows.Any(r => r.IsActive && r.Id != row.Id && RegistrationEmail.Normalize(r.Email) == email))
            throw new ConflictException("Email đã có trong danh sách này.", RegistrationEmailReservation.ConflictCode);
        await RegistrationEmailReservation.EnsureAvailableAsync(registrations, tour.Id, registration.Id,
            [new RosterInput(row.RowNumber, row.RowType, row.DisplayName, email, row.ClassName)], ct);
        var now = clock.GetUtcNow();
        if (registration.State == RegistrationStates.Approved)
        {
            var invitation = (await invitations.LoadAsync(registration.Id, ct)).SingleOrDefault(i => i.RosterRowId == row.Id);
            if (invitation is null)
            {
                if (request.ExpectedInvitationRowVersion is not null) StaleInvitation();
                await issuer.IssueRowAsync(row, tour, command.ActorUserId, now, ct);
            }
            else
            {
                if (request.ExpectedInvitationRowVersion is null) StaleInvitation();
                RowVersionToken.EnsureCurrent(invitation.RowVersion, request.ExpectedInvitationRowVersion!);
                InvitationPolicy.Require(InvitationPolicy.CanReissue(tour, registration, invitation, now));
                await issuer.ReissueAsync(invitation, now, ct);
                invitations.AddAudit(InvitationAudit.Request(invitation, tour.Id, command.ActorUserId, now));
            }
        }
        row.Email = email;
        row.UpdatedAt = now;
        registration.UpdatedAt = now;
        var audit = InvitationAudit.Create(tour.Id, command.ActorUserId, AuditAction, row.Id.ToString("D"),
            request.RequestId, now, "SUCCESS", entityType: "RosterRow");
        audit.DataJson = snapshot;
        registrations.AddAudit(audit);
        return Unit.Value;
    }

    private static void StaleInvitation() => throw new ConflictException("Lời mời đã thay đổi. Tải lại trước khi sửa email.", RowVersionToken.StaleCode);
}
