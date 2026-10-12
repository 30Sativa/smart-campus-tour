using System.Security.Cryptography;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations.Commands.AccessTour;

public sealed record StudentTourInfo(Guid TourId, string TourName, string TourState, DateTimeOffset ScheduledStartAt,
    DateTimeOffset InvitationExpiresAt, string RowType, string? FallbackVideoUrl);
public sealed record StudentAccessResult(StudentTourInfo? Info, string? Token);
public sealed record AccessTourCommand(Guid TourId, string Operation, string? AccessCode, string? SessionToken)
    : IRegistrationMutationCommand<StudentAccessResult>;
public sealed class AccessTourCommandValidator : AbstractValidator<AccessTourCommand>
{
    public AccessTourCommandValidator()
    {
        When(c => c.Operation == "join", () => RuleFor(c => c.AccessCode).NotEmpty().MaximumLength(64));
    }
}
public sealed class AccessTourCommandHandler(IStudentAccessRepository repository, IRegistrationRepository registrations,
    IInvitationCodeService codes, InvitationSettings settings, TimeProvider clock)
    : IRequestHandler<AccessTourCommand, StudentAccessResult>
{
    private static UnauthorizedException Invalid() => new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");
    public async Task<StudentAccessResult> Handle(AccessTourCommand command, CancellationToken ct)
    {
        if (!settings.Enabled) throw Invalid();
        var tokenHash = command.SessionToken is null ? null : codes.Hash("browser-session:" + command.SessionToken);
        var id = command.Operation == "join"
            ? await repository.FindInvitationIdAsync(command.TourId, codes.Hash(command.AccessCode!), ct)
            : tokenHash is null ? null : await repository.FindSessionInvitationIdAsync(command.TourId, tokenHash, ct);
        if (id is null) {
            if (command.Operation == "leave") return new(null, null);
            throw Invalid();
        }
        var tour = await registrations.LockTourAsync(command.TourId, ct) ?? throw Invalid();
        var now = clock.GetUtcNow();
        await repository.CloseExpiredAsync(id.Value, now, ct);
        var invitation = await repository.LoadAsync(id.Value, ct) ?? throw Invalid();
        var current = tokenHash is null ? null : invitation.BrowserSessions.FirstOrDefault(s =>
            CryptographicOperations.FixedTimeEquals(s.SessionTokenHash, tokenHash));
        if (command.Operation == "leave")
        {
            if (current?.EndedAt is null && current is not null) { current.EndedAt = now; current.EndReason = "LOGOUT"; }
            return new(null, null);
        }
        // Re-check the hash after taking the shared lock: reissue may have won the race.
        if (command.Operation == "join" && !CryptographicOperations.FixedTimeEquals(invitation.AccessCodeHash, codes.Hash(command.AccessCode!)))
            throw Invalid();
        var allowed = InvitationPolicy.CanSend(tour, invitation.RosterRow.Registration, invitation, now) ||
            tour.State == "CANCELLED" && tour.StartedAt is not null && InvitationPolicy.CanRevoke(tour, invitation.RosterRow.Registration, invitation, now);
        if (!allowed) throw Invalid();
        var active = invitation.BrowserSessions.SingleOrDefault(s => s.EndedAt is null);
        string? token = command.SessionToken;
        if (active is not null)
        {
            if (current?.Id != active.Id)
                throw new ConflictException("Lời mời đang được dùng trên browser khác. Liên hệ đại diện để thu hồi/cấp mã mới.", "INVITATION_IN_USE");
        }
        else
        {
            if (command.Operation != "join") throw Invalid();
            token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            active = new BrowserSession { Id = Guid.NewGuid(), InvitationId = invitation.Id,
                SessionTokenHash = codes.Hash("browser-session:" + token), CreatedAt = now, ExpiresAt = now };
            repository.Add(active);
            if (!await repository.HasEnteredAsync(invitation.Id, ct))
                repository.AddAudit(InvitationAudit.Create(tour.Id, null, "INVITATION_ENTERED", invitation.Id.ToString("D"),
                    Guid.NewGuid(), now, "OK"));
        }
        active.LastSeenAt = now;
        active.ExpiresAt = now.AddMinutes(settings.SessionIdleMinutes) < invitation.ExpiresAt
            ? now.AddMinutes(settings.SessionIdleMinutes) : invitation.ExpiresAt;
        return new(new(tour.Id, tour.Name, tour.State, tour.ScheduledStartAt, invitation.ExpiresAt, invitation.RosterRow.RowType,
            tour.State == "CANCELLED" && tour.StartedAt is not null ? tour.FallbackVideoUrl : null), token);
    }
}
