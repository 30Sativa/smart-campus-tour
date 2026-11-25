using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.RefreshTourNarration;

public sealed record RefreshTourNarrationRequest(Guid RequestId, string ExpectedRowVersion);

/// <summary>
/// ADR-0067. A route command, not a Tour one: it may save and submit a route revision, which needs the route
/// transaction (serializable). It still lives under Tours.Commands, so the Tour pages are told after commit.
/// </summary>
public sealed record RefreshTourNarrationCommand(Guid Id, Guid Actor, RefreshTourNarrationRequest Request)
    : IRouteMutationCommand<TourNarrationRefreshResult>;

public sealed class RefreshTourNarrationCommandValidator : AbstractValidator<RefreshTourNarrationCommand>
{
    public RefreshTourNarrationCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
        });
    }
}

/// <summary>
/// ADR-0067: Staff gives a Tour still to run the newest approved narration of its POIs, without cancelling it. Under
/// the Tour lock: the route's newest revision must have the Tour's exact path; when it does not already carry the
/// newest approved narration it is saved again (which snapshots that narration, ADR-0060) and submitted, keeping the
/// applied test run of the same path; the target must still be schedulable; then the Tour moves to it. One transaction:
/// any refusal leaves no new revision behind. Lock order Tour → route → POIs → map, as READY and SaveRouteRevision.
/// </summary>
public sealed class RefreshTourNarrationCommandHandler(
    ITourManagementRepository tours,
    IRegistrationRepository registrations,
    IRouteRevisionRepository revisions,
    IMapVersionRepository maps,
    IApplicationDbContext db,
    IRequestHandler<SaveRouteRevisionCommand, RouteRevisionView> saveRevision,
    IRequestHandler<SubmitRouteRevisionCommand, RouteRevisionView> submitRevision,
    IEnumerable<IValidator<SaveRouteRevisionCommand>> saveValidators,
    TimeProvider clock) : IRequestHandler<RefreshTourNarrationCommand, TourNarrationRefreshResult>
{
    public async Task<TourNarrationRefreshResult> Handle(RefreshTourNarrationCommand command, CancellationToken ct)
    {
        var request = command.Request;
        var action = TourLifecycleEvents.NarrationRefreshed;
        var fingerprint = TourRequestReceipt.Fingerprint(action, command.Id);
        if (await TourRequestReceipt.ReplayAsync(tours, command.Actor, request.RequestId, action, command.Id, fingerprint, ct) is { } replayed)
            return await CurrentAsync(replayed, ct);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, request.ExpectedRowVersion);
        var permissions = TourPreparation.Permissions(tour, await tours.GetUsageAsync(tour.Id, ct));
        var plan = tour.RouteRevisionId is { } revisionId ? await TourNarrationRefresh.PlanAsync(revisions, revisionId, ct) : null;
        if (TourNarrationRefresh.Blocker(tour, permissions, plan) is { } blocked)
            throw new ConflictException(blocked.Message, blocked.Code);
        var updated = plan!.Stops.Where(stop => stop.HasNewer).Select(stop => stop.Name).ToArray();

        var target = plan.Latest;
        if (!plan.LatestNarrationCurrent)
        {
            var save = new SaveRouteRevisionCommand(command.Actor, plan.Latest.RouteId,
                TourNarrationRefresh.RepeatInput(plan.Latest, plan.LatestStops,
                    TourNarrationRefresh.DerivedRequestId(request.RequestId, "save")));
            await ValidateAsync(save, ct);
            var saved = await saveRevision.Handle(save, ct);
            await db.SaveChangesAsync(ct);
            target = await revisions.FindRevisionAsync(saved.RevisionId, ct)
                ?? throw new InvalidOperationException("The saved route revision was not found in its own transaction.");
        }
        if (plan.LatestNarrationCurrent && plan.LatestSubmitted && target.Id == tour.RouteRevisionId)
            throw new ConflictException(TourNarrationRefresh.UpToDateMessage, TourNarrationRefresh.UpToDateCode);
        if (!plan.LatestNarrationCurrent || !plan.LatestSubmitted)
        {
            await submitRevision.Handle(new SubmitRouteRevisionCommand(command.Actor, target.RouteId, target.Id,
                new RouteRevisionRequest(TourNarrationRefresh.DerivedRequestId(request.RequestId, "submit"), target.RevisionNumber)), ct);
            await db.SaveChangesAsync(ct);
        }
        // The same path keeps the applied PASS (ADR-0023 addendum); if it somehow does not, nothing above is kept.
        await TourTarget.RequireSchedulableRevisionAsync(revisions, maps, target, lockTarget: true, ct);

        var now = clock.GetUtcNow();
        var from = tour.RouteRevisionId!.Value;
        tour.RouteRevisionId = target.Id;
        tour.UpdatedAt = now;
        tours.AddAudit(new AuditLog
        {
            TourId = tour.Id, ActorUserId = command.Actor, CorrelationId = request.RequestId,
            EntityType = "Tour", EntityId = tour.Id.ToString("D"), Action = action, ResultCode = "SUCCESS", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new
            {
                fingerprint, changedFields = new[] { "routeRevisionId" },
                fromRouteRevisionId = from, toRouteRevisionId = target.Id, toRevisionNumber = target.RevisionNumber,
                updatedStops = updated
            })
        });
        return new TourNarrationRefreshResult(tour.Id, target.Id, target.RevisionNumber, updated);
    }

    private async Task ValidateAsync(SaveRouteRevisionCommand save, CancellationToken ct)
    {
        var failures = new List<FluentValidation.Results.ValidationFailure>();
        foreach (var validator in saveValidators)
            failures.AddRange((await validator.ValidateAsync(save, ct)).Errors);
        if (failures.Count > 0) throw new ValidationException(failures);
    }

    private async Task<TourNarrationRefreshResult> CurrentAsync(Guid tourId, CancellationToken ct)
    {
        var tour = await tours.FindAsync(tourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var revision = tour.RouteRevisionId is { } id ? await revisions.FindRevisionAsync(id, ct) : null;
        return new TourNarrationRefreshResult(tourId, revision?.Id ?? Guid.Empty, revision?.RevisionNumber ?? 0, []);
    }
}
