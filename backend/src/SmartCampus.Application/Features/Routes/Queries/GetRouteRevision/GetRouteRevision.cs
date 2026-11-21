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

public sealed record GetRouteRevisionQuery(Guid RouteId, Guid? RevisionId, bool IncludeHistory) : IRequest<RouteRevisionView>;
public sealed class GetRouteRevisionHandler(IRouteRevisionRepository repo, Tours.TourScheduleSettings schedule) : IRequestHandler<GetRouteRevisionQuery, RouteRevisionView>
{
    public async Task<RouteRevisionView> Handle(GetRouteRevisionQuery q, CancellationToken ct)
    {
        var route = await repo.FindRouteAsync(q.RouteId, ct) ?? throw new NotFoundException("Versioned route", q.RouteId);
        var revision = q.RevisionId.HasValue ? await repo.FindRevisionAsync(q.RevisionId.Value, ct) : await repo.GetCurrentRevisionAsync(q.RouteId, ct);
        if (revision is null || revision.RouteId != q.RouteId) throw new NotFoundException("Route revision", q.RevisionId ?? Guid.Empty);
        return await RouteRevisionMapper.Load(repo, route.Id, revision.Id, q.IncludeHistory, ct, schedule);
    }
}

internal static class RouteRevisionMapper
{
    /// <summary>
    /// Without <paramref name="schedule"/> the view reports ScheduleFit UNKNOWN and no expected length; every handler that
    /// returns the view to a screen passes it.
    /// </summary>
    public static async Task<RouteRevisionView> Load(IRouteRevisionRepository repo, Guid routeId, Guid revisionId, bool history, CancellationToken ct,
        Tours.TourScheduleSettings? schedule = null)
    {
        var route = await repo.FindRouteAsync(routeId, ct) ?? throw new NotFoundException("Versioned route", routeId);
        var revision = await repo.FindRevisionAsync(revisionId, ct) ?? throw new NotFoundException("Route revision", revisionId);
        var map = await repo.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Map version", revision.MapVersionId);
        var stops = await repo.GetStopsAsync(revision.Id, ct);
        var eligibilityIssues = new List<string>();
        var proposalByStop = new Dictionary<Guid, Guid>();
        foreach (var stop in stops)
        {
            var poi = await repo.FindPoiRevisionAsync(stop.PoiProposalRevisionId, ct);
            if (poi is not null) proposalByStop[stop.Id] = poi.ProposalId;
            var source = await repo.FindPoiVerificationAsync(stop.SourcePoiVerificationRecordId, ct);
            var latestPoiResult = poi is null ? null : await repo.GetEffectivePoiVerificationAsync(poi.ProposalId, poi.NavigationFingerprint, ct);
            if (poi is null || source is null || source.ResultCode != "PASS" || latestPoiResult is null || latestPoiResult.ResultCode != "PASS")
                eligibilityIssues.Add($"POI_VERIFICATION_REQUIRED:{stop.PoiProposalRevisionId:D}");
        }
        var unusable = (await repo.FindPoiProposalsAsync(proposalByStop.Values.Distinct().ToArray(), ct))
            .Where(p => p.RetiredAt is not null || p.DiscardedAt is not null).Select(p => p.Id).ToHashSet();
        var retiredPoiNames = stops.Where(s => proposalByStop.TryGetValue(s.Id, out var id) && unusable.Contains(id))
            .OrderBy(s => s.StopOrder).Select(s => s.Name).ToArray();
        var submissions = await repo.GetSubmissionsAsync(revision.Id, ct);
        var targetNavigation = RouteNavigationConfigurationFactory.FromRevision(revision, stops);
        var routeRuns = await repo.GetTestRunsForRouteAsync(route.Id, ct);
        var pathRuns = RouteVerification.RunsOnPath(routeRuns, targetNavigation);
        var runs = history ? routeRuns : pathRuns.Select(run => run.Record).ToArray();
        // ADR-0065: a voting route's result also depends on which legs its PASS runs drove.
        var applied = RouteVerification.Evaluate(revision, stops, pathRuns);
        int? expected = schedule is null ? null
            : Tours.TourSchedule.EstimatedDurationSeconds(revision, stops, schedule.EstimatedSpeedMetersPerSecond);
        var duration = "INCOMPLETE_CONTENT_AUDIO_DATA";
        var dwell = stops.Sum(s => s.DwellSeconds);
        var dtoRuns = new List<RouteTestRunView>(runs.Count);
        var names = new Dictionary<Guid, string?>();
        async Task<string?> NameAsync(Guid userId)
        {
            if (!names.TryGetValue(userId, out var name)) names[userId] = name = (await repo.FindUserAsync(userId, ct))?.FullName;
            return name;
        }
        foreach (var r in runs)
            dtoRuns.Add(new RouteTestRunView(r.Id, r.RouteRevisionId, r.MapVersionId,
                Convert.ToHexString(r.MapPackageSha256).ToLowerInvariant(),
                await repo.GetRobotCodeAsync(r.RobotId, ct) ?? "", r.CheckedByUserId,
                r.ParticipatingStaffUserId, r.ResultCode, r.AllStopsReached, r.SafelyStopped, r.LocalizationPassed,
                r.MeasuredDurationSeconds, r.FailureReason, r.EvidenceNote, r.CheckedAt, r.MeasurementBasis,
                await NameAsync(r.CheckedByUserId), await NameAsync(r.ParticipatingStaffUserId),
                RouteVerification.ReadTraversed(r.TraversedStopIdsJson)));
        var revisionRecords = await repo.GetRevisionsAsync(route.Id, submittedOnly: false, ct);
        // Cross-save application (ADR-0023 addendum): every submitted save with this path shares the result recorded on any of them.
        var scheduledTours = await repo.ListScheduledToursAsync(route.Id, ct);
        var shared = new List<RouteSharedResultRevisionView>();
        var summaries = new List<RouteRevisionSummaryView>();
        foreach (var historical in revisionRecords.OrderBy(r => r.RevisionNumber))
        {
            var isSummary = history || historical.Id == revision.Id;
            var isSibling = historical.Id != revision.Id && (await repo.GetSubmissionsAsync(historical.Id, ct)).Count > 0;
            if (!isSummary && !isSibling) continue;
            var historicalStops = await repo.GetStopsAsync(historical.Id, ct);
            var historicalNavigation = RouteNavigationConfigurationFactory.FromRevision(historical, historicalStops);
            if (isSibling && RouteNavigationConfigurationFactory.SameNavigation(historicalNavigation, targetNavigation))
                shared.Add(new RouteSharedResultRevisionView(historical.Id, historical.RevisionNumber, historical.CreatedAt,
                    scheduledTours.Where(tour => tour.RouteRevisionId == historical.Id).ToArray()));
            if (!isSummary) continue;
            var historicalResult = RouteVerification.Evaluate(historical, historicalStops,
                RouteVerification.RunsOnPath(routeRuns, historicalNavigation));
            summaries.Add(new RouteRevisionSummaryView(historical.Id, historical.RevisionNumber, historical.MapVersionId,
                Convert.ToHexString(historical.MapPackageSha256).ToLowerInvariant(),
                Convert.ToHexString(historical.NavigationFingerprint).ToLowerInvariant(),
                (await repo.GetSubmissionsAsync(historical.Id, ct)).Count > 0, historicalResult.Status, historicalResult.Effective?.Id,
                historical.CreatedAt, historical.ViewerChoosesNextStop, historicalResult.LegCoverage));
        }
        return new RouteRevisionView(route.Id, revision.Id, revision.RevisionNumber, revision.Name, revision.Description,
            map.Id, map.MapKey, Convert.ToHexString(map.PackageSha256).ToLowerInvariant(), revision.StartX, revision.StartY,
            revision.StartYaw, revision.EndMode, revision.EndX, revision.EndY, revision.EndYaw,
            Convert.ToHexString(revision.NavigationFingerprint).ToLowerInvariant(), submissions.Count > 0,
            applied.Status, applied.Effective?.Id, duration, dwell,
            stops.Select(s => new RouteRevisionStopView(s.Id, s.PoiProposalRevisionId, s.SourcePoiVerificationRecordId,
                s.StopOrder, s.DwellSeconds, Route.ReadHeadSteps(s.HeadStepsJson), s.Name, s.X, s.Y, s.Yaw,
                s.CameraPreset, s.NarrationText, s.FallbackVideoUrl,
                proposalByStop.TryGetValue(s.Id, out var proposalId) ? proposalId : null)).ToArray(), dtoRuns, summaries, eligibilityIssues,
            route.IsOpenForNewTours, LegacyRouteRevision.For(route), schedule is null ? Tours.RouteScheduleFit.Unknown
                : Tours.TourSchedule.ScheduleFit(schedule, expected), expected, retiredPoiNames, shared,
            scheduledTours.Where(tour => tour.RouteRevisionId == revision.Id).ToArray(),
            revision.ViewerChoosesNextStop, applied.LegCoverage);
    }
}
