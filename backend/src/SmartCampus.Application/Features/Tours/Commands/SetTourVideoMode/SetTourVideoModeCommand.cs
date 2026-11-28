using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.SetTourVideoMode;

public sealed record SetTourVideoModeRequest(string Mode, string Reason);

/// <summary>ADR-0075: the Operator switches what Viewers of a RUNNING Tour watch, the live picture or the fallback video.</summary>
public sealed record SetTourVideoModeCommand(Guid Id, Guid Actor, string Mode, string Reason) : ITourMutationCommand<TourMutationResult>;

public sealed class SetTourVideoModeCommandValidator : AbstractValidator<SetTourVideoModeCommand>
{
    public const int MaxReasonLength = 500;

    public SetTourVideoModeCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Mode).Must(mode => mode is TourVideoModes.Live or TourVideoModes.Fallback)
            .WithMessage($"Chế độ video phải là {TourVideoModes.Live} hoặc {TourVideoModes.Fallback}.");
        RuleFor(c => c.Reason).Must(reason => !string.IsNullOrWhiteSpace(reason) && reason.Trim().Length <= MaxReasonLength)
            .WithMessage($"Lý do phải có từ 1 đến {MaxReasonLength} ký tự.");
    }
}

/// <summary>
/// Only the Tour's Operator, only while RUNNING; FALLBACK needs an uploaded fallback video and the new mode must differ
/// from the current one. Writes <c>VIDEO_FALLBACK_STARTED</c> or <c>VIDEO_LIVE_RESTORED</c> with the actor and the
/// reason; that event is the mode. Never switches by itself.
/// </summary>
public sealed class SetTourVideoModeCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    TimeProvider clock) : IRequestHandler<SetTourVideoModeCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(SetTourVideoModeCommand command, CancellationToken ct)
    {
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới chuyển video được.");
        if (tour.State != TourRuntime.Running) throw Invalid("Chỉ chuyển video khi Tour đang chạy.");
        var fallback = command.Mode == TourVideoModes.Fallback;
        if (fallback && string.IsNullOrWhiteSpace(tour.FallbackVideoUrl)) throw Invalid("Tour chưa có video dự phòng.");
        var current = await repository.GetVideoModeAsync(tour.Id, ct);
        if (current.Mode == command.Mode)
            throw Invalid(fallback ? "Viewer đang xem video dự phòng." : "Viewer đang xem hình trực tiếp.");

        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = fallback ? TourLifecycleEvents.VideoFallbackStarted : TourLifecycleEvents.VideoLiveRestored,
            OccurredAt = clock.GetUtcNow(), RobotId = tour.AssignedRobotId, RouteId = tour.ActiveRouteId,
            ActorUserId = command.Actor, ReasonNote = command.Reason.Trim()
        });
        return new(tour.Id);
    }

    private static ConflictException Invalid(string message) => new(message, TourVideoModes.InvalidCode);
}
