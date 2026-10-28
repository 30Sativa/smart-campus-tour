using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands;

public sealed record ReviewRosterEmailChangeRequest(Guid RequestId, string ExpectedRequestRowVersion,
    string ExpectedTourRowVersion, string ExpectedRegistrationRowVersion, string ExpectedRowVersion,
    string? Reason = null);
public sealed record ReviewRosterEmailChangeCommand(Guid EmailChangeRequestId, Guid StaffUserId,
    string Decision, ReviewRosterEmailChangeRequest Request) : IRegistrationMutationCommand<Unit>;

public sealed class ReviewRosterEmailChangeCommandValidator : AbstractValidator<ReviewRosterEmailChangeCommand>
{
    public ReviewRosterEmailChangeCommandValidator()
    {
        RuleFor(c => c.EmailChangeRequestId).NotEmpty();
        RuleFor(c => c.StaffUserId).NotEmpty();
        RuleFor(c => c.Decision).Must(value => value is "accept" or "reject");
        RuleFor(c => c.Request.RequestId).NotEmpty();
        RuleFor(c => c.Request.ExpectedRequestRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedTourRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedRegistrationRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
        When(c => c.Decision == "reject", () => RuleFor(c => c.Request.Reason).NotEmpty().MaximumLength(1000));
    }
}

public sealed class ReviewRosterEmailChangeCommandHandler(IRegistrationRepository registrations,
    IRosterEmailChangeRepository requests, IInvitationRepository invitations, InvitationIssuer issuer, TimeProvider clock)
    : IRequestHandler<ReviewRosterEmailChangeCommand, Unit>
{
    public async Task<Unit> Handle(ReviewRosterEmailChangeCommand command, CancellationToken ct)
    {
        var tourId = await requests.FindTourIdAsync(command.EmailChangeRequestId, ct)
            ?? throw new NotFoundException("Không tìm thấy yêu cầu đổi email.");
        var registrationId = await requests.FindRegistrationIdAsync(command.EmailChangeRequestId, ct)
            ?? throw new NotFoundException("Không tìm thấy yêu cầu đổi email.");
        var (tour, registration) = await registrations.LockRegistrationAsync(registrationId, owner: null, ct)
            ?? throw new NotFoundException("Không tìm thấy hồ sơ.");
        if (tour.Id != tourId) throw new NotFoundException("Không tìm thấy yêu cầu đổi email.");
        var entity = await requests.FindByIdAsync(command.EmailChangeRequestId, ct)
            ?? throw new NotFoundException("Không tìm thấy yêu cầu đổi email.");
        var row = registration.RosterRows.SingleOrDefault(item => item.Id == entity.RosterRowId && item.IsActive)
            ?? throw new ConflictException("Dòng đăng ký không còn hiệu lực.", "ROW_UNAVAILABLE");
        var action = command.Decision == "accept" ? "ROSTER_EMAIL_CHANGE_ACCEPTED" : "ROSTER_EMAIL_CHANGE_REJECTED";
        var fingerprint = Fingerprint(command, entity.RosterRowId);
        var previous = await registrations.FindMutationAsync(tour.Id, command.Request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.ActorUserId != command.StaffUserId || previous.Action != action ||
                previous.EntityType != "RosterEmailChangeRequest" || previous.EntityId != entity.Id.ToString("D") ||
                previous.DataJson != fingerprint)
                throw new ConflictException("Mã yêu cầu đã được dùng cho quyết định khác.", "IDEMPOTENCY_CONFLICT");
            return Unit.Value;
        }
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedTourRowVersion);
        RowVersionToken.EnsureCurrent(registration.RowVersion, command.Request.ExpectedRegistrationRowVersion);
        RowVersionToken.EnsureCurrent(row.RowVersion, command.Request.ExpectedRowVersion);
        RowVersionToken.EnsureCurrent(entity.RowVersion, command.Request.ExpectedRequestRowVersion);
        if (tour.State != "SCHEDULED") throw new ConflictException("Tour đã khóa yêu cầu đổi email.", "TOUR_LOCKED");
        if (entity.State != "PENDING" || row.ParticipationState != RosterParticipationStates.Accepted)
            throw new ConflictException("Yêu cầu không còn chờ xử lý hoặc dòng không còn được chấp nhận.", "EMAIL_CHANGE_STATE_CONFLICT");
        if (RegistrationEmail.Normalize(row.Email) != RegistrationEmail.Normalize(entity.CurrentEmail))
            throw new ConflictException("Email của dòng đã đổi sau khi gửi yêu cầu.", "EMAIL_CHANGE_STALE");

        var now = clock.GetUtcNow();
        if (command.Decision == "accept")
        {
            var proposed = RegistrationEmail.Normalize(entity.ProposedEmail);
            if (registration.RosterRows.Any(other => other.IsActive && other.Id != row.Id &&
                    RegistrationEmail.Normalize(other.Email) == proposed) ||
                await requests.IsEmailReservedAsync(tour.Id, row.Id, proposed, ct))
                throw new ConflictException("Email đề nghị không còn khả dụng trong Tour này.", RegistrationEmailReservation.ConflictCode);
            var invitation = (await invitations.LoadAsync(registration.Id, ct)).SingleOrDefault(item => item.RosterRowId == row.Id);
            if (invitation is not null)
            {
                InvitationPolicy.Require(InvitationPolicy.CanReissue(tour, registration, invitation, now));
                await issuer.ReissueAsync(invitation, now, ct);
                invitations.AddAudit(InvitationAudit.Request(invitation, tour.Id, command.StaffUserId, now));
            }
            row.Email = proposed;
            row.UpdatedAt = now;
        }
        entity.State = command.Decision == "accept" ? "ACCEPTED" : "REJECTED";
        entity.ReviewedByUserId = command.StaffUserId;
        entity.ReviewedAt = now;
        entity.ReviewReason = command.Request.Reason?.Trim();
        var receipt = new AuditLog
        {
            ActorUserId = command.StaffUserId, TourId = tour.Id, CorrelationId = command.Request.RequestId,
            Action = action, EntityType = "RosterEmailChangeRequest", EntityId = entity.Id.ToString("D"),
            ResultCode = "SUCCESS", OccurredAt = now,
            DataJson = fingerprint
        };
        registrations.AddAudit(receipt);
        return Unit.Value;
    }

    private static string Fingerprint(ReviewRosterEmailChangeCommand command, Guid rowId)
    {
        var payload = JsonSerializer.Serialize(new { command.Decision, command.EmailChangeRequestId, rowId,
            command.Request.ExpectedRequestRowVersion, command.Request.ExpectedTourRowVersion,
            command.Request.ExpectedRegistrationRowVersion, command.Request.ExpectedRowVersion,
            reason = command.Request.Reason?.Trim() });
        return JsonSerializer.Serialize(new { sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))) });
    }
}
