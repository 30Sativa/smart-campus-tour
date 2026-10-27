using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;

/// <summary>Retained only for source/API compatibility; the legacy direct email-write use case is disabled.</summary>
public sealed class CorrectRosterEmailCommandHandler : IRequestHandler<CorrectRosterEmailCommand, Unit>
{
    public const string AuditAction = "ROSTER_EMAIL_CORRECTED";
    public CorrectRosterEmailCommandHandler(IRegistrationRepository registrations, IInvitationRepository invitations,
        InvitationSettings settings, InvitationIssuer issuer, TimeProvider clock) { }

    public Task<Unit> Handle(CorrectRosterEmailCommand command, CancellationToken ct) =>
        Task.FromException<Unit>(new ConflictException(
            "Direct roster email correction is a legacy operation. Use the Representative request and Staff review workflow.",
            "LEGACY_EMAIL_CORRECTION_DISABLED"));
}
