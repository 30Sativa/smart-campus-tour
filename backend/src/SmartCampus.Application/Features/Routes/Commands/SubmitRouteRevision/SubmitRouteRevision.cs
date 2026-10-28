using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public sealed record SubmitRouteRevisionCommand(Guid ActorUserId, Guid RouteId, Guid RevisionId, RouteRevisionRequest Request)
    : IRouteMutationCommand<RouteRevisionView>;
public sealed class SubmitRouteRevisionValidator : AbstractValidator<SubmitRouteRevisionCommand>
{
    public SubmitRouteRevisionValidator()
    {
        RuleFor(c => c.RouteId).NotEmpty(); RuleFor(c => c.RevisionId).NotEmpty();
        RuleFor(c => c.Request.RequestId).NotEmpty(); RuleFor(c => c.Request.ExpectedCurrentRevision).GreaterThan(0);
    }
}

public sealed class SubmitRouteRevisionHandler(IRouteRevisionRepository repo, TimeProvider clock)
    : IRequestHandler<SubmitRouteRevisionCommand, RouteRevisionView>
{
    public async Task<RouteRevisionView> Handle(SubmitRouteRevisionCommand c, CancellationToken ct)
    {
        var request = c.Request;
        var hash = SaveRouteRevisionHandler.Hash(new { c.RouteId, c.RevisionId, request.ExpectedCurrentRevision });
        await repo.LockRequestAsync(c.ActorUserId, request.RequestId, "submit", ct);
        var prior = await repo.FindSubmissionRequestAsync(c.ActorUserId, request.RequestId, ct);
        if (prior is not null)
        {
            SaveRouteRevisionHandler.EnsureHash(prior.RequestHash, hash);
            return await RouteRevisionMapper.Load(repo, c.RouteId, c.RevisionId, true, ct);
        }
        var route = await repo.LockRouteAsync(c.RouteId, ct) ?? throw new NotFoundException("Versioned route", c.RouteId);
        var current = await repo.GetCurrentRevisionAsync(route.Id, ct);
        if (current is null || current.Id != c.RevisionId || current.RevisionNumber != request.ExpectedCurrentRevision)
            throw new ConflictException("Only the exact current route revision can be submitted.", "STALE_ROUTE_REVISION");
        if (await repo.GetSubmissionsAsync(current.Id, ct) is { Count: > 0 }) throw new ConflictException("This immutable route revision was already submitted.");
        await EnsurePoisStillPass(repo, current.Id, ct);
        var now = clock.GetUtcNow();
        repo.Add(new RouteRevisionSubmission { Id = Guid.NewGuid(), RouteRevisionId = current.Id,
            RequestId = request.RequestId, RequestHash = hash, SubmittedByUserId = c.ActorUserId, SubmittedAt = now });
        repo.AddAudit(new AuditLog { ActorUserId = c.ActorUserId, Action = "ROUTE_REVISION_SUBMITTED", EntityType = "RouteRevision",
            EntityId = current.Id.ToString("D"), ResultCode = "SUBMITTED", OccurredAt = now });
        var view = await RouteRevisionMapper.Load(repo, route.Id, current.Id, true, ct);
        return view with { IsSubmitted = true };
    }
    internal static async Task EnsurePoisStillPass(IRouteRevisionRepository repo, Guid revisionId, CancellationToken ct)
    {
        var stops = await repo.GetStopsAsync(revisionId, ct);
        foreach (var stop in stops)
        {
            var revision = await repo.FindPoiRevisionAsync(stop.PoiProposalRevisionId, ct);
            if (revision is null) throw new ConflictException("Referenced POI revision is missing.", "POI_VERIFICATION_STALE");
            var source = await repo.FindPoiVerificationAsync(stop.SourcePoiVerificationRecordId, ct);
            var latest = await repo.GetEffectivePoiVerificationAsync(revision.ProposalId, revision.NavigationFingerprint, ct);
            if (source is null || source.ResultCode != "PASS" || source.MapVersionId != stop.MapVersionId ||
                !CryptographicOperations.FixedTimeEquals(source.NavigationFingerprint, stop.PoiNavigationFingerprint) ||
                latest is null || latest.ResultCode != "PASS")
                throw new ConflictException("A referenced POI PASS is no longer effective; save a new route revision after resolving the POI state.", "POI_VERIFICATION_STALE");
        }
    }
}
