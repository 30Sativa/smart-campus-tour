using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.RegistrationReview.Commands;

public sealed record ReviewRosterRowRequest(Guid RequestId, string ExpectedRegistrationRowVersion,
    string ExpectedTourRowVersion, string ExpectedRowVersion, string? Reason = null);
public sealed record ReviewRosterRowCommand(Guid RegistrationId, Guid RowId, Guid ActorUserId,
    string Decision, ReviewRosterRowRequest Request) : IRegistrationMutationCommand<Unit>;

public sealed class ReviewRosterRowCommandValidator : AbstractValidator<ReviewRosterRowCommand>
{
    public ReviewRosterRowCommandValidator()
    {
        RuleFor(c => c.RegistrationId).NotEmpty();
        RuleFor(c => c.RowId).NotEmpty();
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.Decision).Must(value => value is "accept" or "reject");
        RuleFor(c => c.Request.RequestId).NotEmpty();
        RuleFor(c => c.Request.ExpectedRegistrationRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedTourRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
        When(c => c.Decision == "reject", () => RuleFor(c => c.Request.Reason).NotEmpty().MaximumLength(1000));
    }
}

public sealed class ReviewRosterRowCommandHandler(IRegistrationRepository registrations,
    InvitationSettings invitationSettings, InvitationIssuer issuer, TimeProvider clock,
    IValidator<RosterInput> rosterInputValidator)
    : IRequestHandler<ReviewRosterRowCommand, Unit>
{
    public async Task<Unit> Handle(ReviewRosterRowCommand command, CancellationToken ct)
    {
        var (tour, registration) = await registrations.LockRegistrationAsync(command.RegistrationId, owner: null, ct)
            ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var action = command.Decision == "accept" ? "ROSTER_ROW_ACCEPTED" : "ROSTER_ROW_REJECTED";
        var fingerprint = Fingerprint(command);
        var previous = await registrations.FindMutationAsync(tour.Id, command.Request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.ActorUserId != command.ActorUserId || previous.Action != action ||
                previous.EntityType != "RosterRow" || previous.EntityId != command.RowId.ToString("D") ||
                previous.DataJson != fingerprint)
                throw new ConflictException("Mã yêu cầu đã được dùng cho quyết định khác.", "IDEMPOTENCY_CONFLICT");
            return Unit.Value;
        }
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedTourRowVersion);
        RowVersionToken.EnsureCurrent(registration.RowVersion, command.Request.ExpectedRegistrationRowVersion);
        if (tour.State != "SCHEDULED") throw new ConflictException("Tour không còn mở duyệt.", "TOUR_LOCKED");
        var row = registration.RosterRows.SingleOrDefault(item => item.Id == command.RowId && item.IsActive)
            ?? throw new NotFoundException("Không tìm thấy dòng đăng ký đang hoạt động.");
        RowVersionToken.EnsureCurrent(row.RowVersion, command.Request.ExpectedRowVersion);
        if (row.ParticipationState != RosterParticipationStates.Pending)
            throw new ConflictException("Chỉ dòng đang chờ mới được Staff quyết định.", "ROW_STATE_CONFLICT");
        var now = clock.GetUtcNow();
        if (command.Decision == "accept")
        {
            var acceptedRosterRow = new RosterInput(row.RowNumber, row.RowType, row.DisplayName, row.Email, row.ClassName);
            var rowValidation = await rosterInputValidator.ValidateAsync(acceptedRosterRow, ct);
            if (!rowValidation.IsValid) throw new ValidationException(rowValidation.Errors);
            await RegistrationEmailReservation.EnsureAvailableAsync(registrations, tour.Id, registration.Id,
                [acceptedRosterRow], ct);
            row.ParticipationState = RosterParticipationStates.Accepted;
            row.ReviewReason = null;
            if (invitationSettings.Enabled)
                await issuer.IssueRowAsync(row, tour, command.ActorUserId, now, ct);
        }
        else
        {
            row.ParticipationState = RosterParticipationStates.Rejected;
            row.ReviewReason = command.Request.Reason!.Trim();
        }
        row.ReviewedByUserId = command.ActorUserId;
        row.ReviewedAt = now;
        row.UpdatedAt = now;
        registration.State = RegistrationStates.FromRows(registration.RosterRows);
        registration.ReviewedByUserId = command.ActorUserId;
        registration.ReviewedAt = now;
        registration.RejectionReason = registration.State == RegistrationStates.Rejected ? row.ReviewReason : null;
        registration.UpdatedAt = now;
        registrations.AddAudit(new AuditLog
        {
            ActorUserId = command.ActorUserId, TourId = tour.Id, CorrelationId = command.Request.RequestId,
            Action = action, EntityType = "RosterRow", EntityId = row.Id.ToString("D"), ResultCode = "SUCCESS",
            DataJson = fingerprint, OccurredAt = now
        });
        return Unit.Value;
    }

    private static string Fingerprint(ReviewRosterRowCommand command)
    {
        var payload = JsonSerializer.Serialize(new { command.Decision, command.RowId,
            command.Request.ExpectedRegistrationRowVersion, command.Request.ExpectedTourRowVersion,
            command.Request.ExpectedRowVersion, reason = command.Request.Reason?.Trim() });
        return JsonSerializer.Serialize(new { sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))) });
    }
}
