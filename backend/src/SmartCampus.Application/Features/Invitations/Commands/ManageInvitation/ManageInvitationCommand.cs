using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Invitations.Commands.ManageInvitation;

public sealed record InvitationRequest(Guid RequestId, string ExpectedRowVersion, string? ExpectedTourRowVersion = null);
public sealed record ManageInvitationCommand(Guid RegistrationId, Guid? InvitationId, Guid Actor, Guid? Owner,
    string Operation, InvitationRequest Request) : IRegistrationMutationCommand<Unit>;
public sealed class ManageInvitationCommandValidator : AbstractValidator<ManageInvitationCommand>
{
    public ManageInvitationCommandValidator()
    {
        RuleFor(c => c.Request.RequestId).NotEmpty();
        RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
        When(c => c.Operation == "issue", () => RuleFor(c => c.Request.ExpectedTourRowVersion).Must(RowVersionToken.IsValid));
    }
}
public sealed class ManageInvitationCommandHandler(IRegistrationRepository registrations, IInvitationRepository repository,
    InvitationSettings settings, InvitationIssuer issuer, TimeProvider clock)
    : IRequestHandler<ManageInvitationCommand, Unit>
{
    public async Task<Unit> Handle(ManageInvitationCommand command, CancellationToken ct)
    {
        if (!settings.Enabled) throw new ConflictException("Hỗ trợ lời mời chưa được bật.", "INVITATIONS_DISABLED");
        var (tour, registration) = await registrations.LockRegistrationAsync(command.RegistrationId, command.Owner, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var entity = (command.InvitationId ?? registration.Id).ToString("D");
        var action = "INVITATION_" + command.Operation.ToUpperInvariant();
        var previous = await repository.FindRequestAsync(command.Request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.ActorUserId != command.Actor || previous.EntityId != entity || previous.Action != action)
                throw new ConflictException("Mã yêu cầu đã được dùng cho thao tác khác.", "IDEMPOTENCY_CONFLICT");
            return Unit.Value;
        }
        var now = clock.GetUtcNow();
        if (command.Operation == "issue")
        {
            RowVersionToken.EnsureCurrent(registration.RowVersion, command.Request.ExpectedRowVersion);
            RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedTourRowVersion!);
            InvitationPolicy.Require(registration.State == "APPROVED" && tour.State is "SCHEDULED" or "READY" or "RUNNING");
            await issuer.IssueAsync(registration, tour, command.Actor, now, ct);
        }
        else
        {
            var invitation = (await repository.LoadAsync(registration.Id, ct)).SingleOrDefault(i => i.Id == command.InvitationId)
                ?? throw new NotFoundException("Không tìm thấy lời mời.");
            RowVersionToken.EnsureCurrent(invitation.RowVersion, command.Request.ExpectedRowVersion);
            InvitationPolicy.Require(command.Operation == "revoke"
                ? InvitationPolicy.CanRevoke(tour, registration, invitation, now)
                : command.Operation == "reissue" ? InvitationPolicy.CanReissue(tour, registration, invitation, now)
                : InvitationPolicy.CanSend(tour, registration, invitation, now));
            if (command.Operation != "revoke")
            {
                var latest = await repository.LatestSendAsync(invitation.Id, ct);
                if (latest?.OccurredAt.AddSeconds(60) > now)
                    throw new ConflictException("Vui lòng đợi một phút trước khi gửi lại.", "EMAIL_COOLDOWN");
            }
            if (command.Operation is "reissue" or "revoke")
            {
                foreach (var session in invitation.BrowserSessions.Where(s => s.EndedAt is null))
                { session.EndedAt = now; session.EndReason = "INVITATION_REVOKED"; }
                invitation.UpdatedAt = now;
                if (command.Operation == "revoke") invitation.RevokedAt = now;
                else
                {
                    invitation.AccessVersion = checked(invitation.AccessVersion + 1);
                    var code = await issuer.CreateCodeAsync(invitation.Id, invitation.AccessVersion, ct);
                    invitation.AccessCodeHash = code.Hash; invitation.AccessCodeProtected = code.Protected;
                    invitation.CodeIssuedAt = now;
                    invitation.RevokedAt = null;
                }
            }
            if (command.Operation != "revoke") repository.AddAudit(InvitationAudit.Request(invitation, tour.Id, command.Actor, now));
        }
        repository.AddAudit(InvitationAudit.Create(tour.Id, command.Actor, action, entity, command.Request.RequestId,
            now, "OK", entityType: command.Operation == "issue" ? "GroupRegistration" : "Invitation"));
        return Unit.Value;
    }
}
