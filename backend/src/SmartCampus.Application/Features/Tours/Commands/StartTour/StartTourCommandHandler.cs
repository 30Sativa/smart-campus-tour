using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.StartTour;

/// <summary>
/// M2.1 Start: runs the whole preflight under the Tour lock and always refuses (ADR-0042). There is no command
/// transport, so this handler has no write path: no state, StartedAt, robot claim, TourEvent or receipt. The
/// refused command throws, so the UnitOfWork pipeline never commits; the transaction only holds the locks.
/// </summary>
public sealed class StartTourCommandHandler(IRegistrationRepository registrations, TourStartPreflight preflight,
    ILogger<StartTourCommandHandler> logger) : IRequestHandler<StartTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(StartTourCommand command, CancellationToken ct)
    {
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới Start được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        var result = await preflight.EvaluateAsync(tour, null, command.Request.Confirmation,
            includeConfirmation: true, lockTarget: true, ct);

        var preconditionFailed = result.BlockedBy.Any(id => id != TourStartPreflight.TransportCheck);
        var code = preconditionFailed ? TourStartPreflight.FailedCode : TourStartPreflight.TransportDisabledCode;
        logger.LogInformation("Tour {TourId} Start refused for operator {ActorUserId}: {Code}; blocked by {BlockedBy}.",
            tour.Id, command.Actor, code, string.Join(',', result.BlockedBy));
        throw new ConflictException(
            preconditionFailed ? "Tour chưa đủ điều kiện Start." : "Command transport chưa bật nên chưa Start được Tour.",
            code, checks: result.Checks, blockedBy: result.BlockedBy);
    }
}
