using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.ChangeTourCapacity;

public sealed record ChangeTourCapacityRequest(Guid RequestId, string ExpectedRowVersion, int Capacity);
public sealed record ChangeTourCapacityCommand(Guid Id, Guid Actor, ChangeTourCapacityRequest Request) : ITourMutationCommand<TourMutationResult>;

public sealed class ChangeTourCapacityCommandValidator : AbstractValidator<ChangeTourCapacityCommand>
{
    public ChangeTourCapacityCommandValidator(TourScheduleSettings settings)
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.Capacity).InclusiveBetween(1, settings.MaxCapacity)
                .WithMessage($"Sức chứa phải từ 1 đến {settings.MaxCapacity} chỗ.");
        });
    }
}

/// <summary>Staff changes the seats of a Tour before Start (BR-26, ADR-0048). READY stays READY.</summary>
public sealed class ChangeTourCapacityCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ChangeTourCapacityCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(ChangeTourCapacityCommand command, CancellationToken ct)
    {
        var request = command.Request;
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.CapacityChanged, command.Id, request.Capacity);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, request.RequestId,
            TourLifecycleEvents.CapacityChanged, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, request.ExpectedRowVersion);
        if (!TourPreparation.Permissions(tour, await repository.GetUsageAsync(tour.Id, ct)).CanChangeCapacity)
            throw new ConflictException("Chỉ đổi được sức chứa trước khi Tour bắt đầu.", "TOUR_LOCKED");
        var held = await registrations.CountHeldSeatsAsync(tour.Id, null, ct);
        if (request.Capacity < held)
            throw new ConflictException($"Tour đang giữ {held} chỗ nên không giảm sức chứa xuống {request.Capacity} được.", "CAPACITY_BELOW_HELD",
                new Dictionary<string, string[]> { ["heldSeats"] = [held.ToString(System.Globalization.CultureInfo.InvariantCulture)] });
        var now = clock.GetUtcNow();
        tour.Capacity = request.Capacity;
        tour.UpdatedAt = now;
        TourRequestReceipt.Append(repository, tour, command.Actor, request.RequestId, TourLifecycleEvents.CapacityChanged, fingerprint, now, "capacity");
        return new(tour.Id);
    }
}
