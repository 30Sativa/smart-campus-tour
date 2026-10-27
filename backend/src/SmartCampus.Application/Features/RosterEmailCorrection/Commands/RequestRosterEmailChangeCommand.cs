using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands;

public sealed record RequestRosterEmailChangeRequest(Guid RequestId, string ProposedEmail,
    string ExpectedTourRowVersion, string ExpectedRegistrationRowVersion, string ExpectedRowVersion);
public sealed record RequestRosterEmailChangeCommand(Guid RegistrationId, Guid RowId, Guid RepresentativeUserId,
    RequestRosterEmailChangeRequest Request) : IRegistrationMutationCommand<Guid>;

public sealed class RequestRosterEmailChangeCommandValidator : AbstractValidator<RequestRosterEmailChangeCommand>
{
    public RequestRosterEmailChangeCommandValidator()
    {
        RuleFor(c => c.RegistrationId).NotEmpty();
        RuleFor(c => c.RowId).NotEmpty();
        RuleFor(c => c.RepresentativeUserId).NotEmpty();
        RuleFor(c => c.Request.RequestId).NotEmpty();
        RuleFor(c => c.Request.ProposedEmail).NotEmpty().MaximumLength(254).Must(RegistrationEmail.IsValid);
        RuleFor(c => c.Request.ExpectedTourRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedRegistrationRowVersion).Must(RowVersionToken.IsValid);
        RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
    }
}

public sealed class RequestRosterEmailChangeCommandHandler(IRegistrationRepository registrations,
    IRosterEmailChangeRepository requests, TimeProvider clock)
    : IRequestHandler<RequestRosterEmailChangeCommand, Guid>
{
    public async Task<Guid> Handle(RequestRosterEmailChangeCommand command, CancellationToken ct)
    {
        var (tour, registration) = await registrations.LockRegistrationAsync(command.RegistrationId,
            command.RepresentativeUserId, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var request = command.Request;
        var email = RegistrationEmail.Normalize(request.ProposedEmail);
        var replay = await requests.FindByRequesterRequestIdAsync(command.RepresentativeUserId, request.RequestId, ct);
        if (replay is not null)
        {
            if (replay.RosterRowId != command.RowId || RegistrationEmail.Normalize(replay.ProposedEmail) != email)
                throw new ConflictException("Mã yêu cầu đã được dùng cho yêu cầu khác.", "IDEMPOTENCY_CONFLICT");
            return replay.Id;
        }
        RowVersionToken.EnsureCurrent(tour.RowVersion, request.ExpectedTourRowVersion);
        RowVersionToken.EnsureCurrent(registration.RowVersion, request.ExpectedRegistrationRowVersion);
        if (tour.State != "SCHEDULED") throw new ConflictException("Không thể yêu cầu đổi email khi Tour không ở trạng thái SCHEDULED.", "TOUR_LOCKED");
        var row = registration.RosterRows.SingleOrDefault(item => item.Id == command.RowId && item.IsActive)
            ?? throw new NotFoundException("Không tìm thấy dòng đăng ký đang hoạt động.");
        RowVersionToken.EnsureCurrent(row.RowVersion, request.ExpectedRowVersion);
        if (row.ParticipationState != RosterParticipationStates.Accepted)
            throw new ConflictException("Chỉ dòng đã được chấp nhận mới có thể yêu cầu đổi email.", "ROW_NOT_ACCEPTED");
        if (RegistrationEmail.Normalize(row.Email) == email)
            throw new ConflictException("Email đề nghị phải khác email hiện tại.", "EMAIL_UNCHANGED");
        if (registration.RosterRows.Any(other => other.IsActive && other.Id != row.Id &&
                RegistrationEmail.Normalize(other.Email) == email) ||
            await requests.IsEmailReservedAsync(tour.Id, row.Id, email, ct))
            throw new ConflictException("Email đã được đăng ký hoặc đang được giữ trong Tour này.", RegistrationEmailReservation.ConflictCode);

        var now = clock.GetUtcNow();
        var entity = new RosterEmailChangeRequest
        {
            Id = Guid.NewGuid(), RosterRowId = row.Id, RequestId = request.RequestId,
            CurrentEmail = RegistrationEmail.Normalize(row.Email), ProposedEmail = email,
            RequestedByUserId = command.RepresentativeUserId, State = "PENDING", CreatedAt = now
        };
        requests.Add(entity);
        var receipt = new AuditLog
        {
            ActorUserId = command.RepresentativeUserId, TourId = tour.Id, CorrelationId = request.RequestId,
            Action = "ROSTER_EMAIL_CHANGE_REQUESTED", EntityType = "RosterEmailChangeRequest",
            EntityId = entity.Id.ToString("D"), ResultCode = "SUCCESS", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { registrationId = registration.Id, rowId = row.Id,
                request.ExpectedTourRowVersion, request.ExpectedRegistrationRowVersion, request.ExpectedRowVersion })
        };
        registrations.AddAudit(receipt);
        return entity.Id;
    }
}
