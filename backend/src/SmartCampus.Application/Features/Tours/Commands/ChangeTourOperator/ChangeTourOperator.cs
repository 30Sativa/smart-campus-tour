using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Commands.ChangeTourOperator;

public sealed record ChangeTourOperatorRequest(Guid RequestId, string ExpectedRowVersion, Guid OperatorUserId);
public sealed record ChangeTourOperatorCommand(Guid Id, Guid Actor, ChangeTourOperatorRequest Request) : ITourMutationCommand<TourMutationResult>;

public sealed class ChangeTourOperatorCommandValidator : AbstractValidator<ChangeTourOperatorCommand>
{
    public ChangeTourOperatorCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.OperatorUserId).NotEmpty();
        });
    }
}

/// <summary>Staff hands a Tour to another Staff account before Start (section 7.3, decision 8, ADR-0048). READY stays READY.</summary>
public sealed class ChangeTourOperatorCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TimeProvider clock) : IRequestHandler<ChangeTourOperatorCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(ChangeTourOperatorCommand command, CancellationToken ct)
    {
        var request = command.Request;
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.OperatorChanged, command.Id, request.OperatorUserId);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, request.RequestId,
            TourLifecycleEvents.OperatorChanged, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, request.ExpectedRowVersion);
        if (tour.RouteRevisionId is null)
            throw new ConflictException("Tour kiểu cũ không có người vận hành để đổi.", "ROUTE_VERSION_REQUIRED");
        if (!TourPreparation.Permissions(tour, await repository.GetUsageAsync(tour.Id, ct)).CanChangeOperator)
            throw new ConflictException("Chỉ đổi được người vận hành trước khi Tour bắt đầu.", "TOUR_LOCKED");
        // Account deactivation holds this same row lock while it checks the Tours, so one of the two sees the other.
        await repository.LockAccountAsync(request.OperatorUserId, ct);
        await TourTarget.RequireOperatorAsync(revisions, request.OperatorUserId, ct);
        if (tour.OperatorUserId == request.OperatorUserId) return new(tour.Id);
        var now = clock.GetUtcNow();
        tour.OperatorUserId = request.OperatorUserId;
        tour.UpdatedAt = now;
        TourRequestReceipt.Append(repository, tour, command.Actor, request.RequestId, TourLifecycleEvents.OperatorChanged, fingerprint, now, "operatorUserId");
        return new(tour.Id);
    }
}
