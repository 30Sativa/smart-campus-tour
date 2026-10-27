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
public sealed class GetRouteRevisionHandler(IRouteRevisionRepository repo) : IRequestHandler<GetRouteRevisionQuery, RouteRevisionView>
{
    public async Task<RouteRevisionView> Handle(GetRouteRevisionQuery q, CancellationToken ct)
    {
        var route = await repo.FindRouteAsync(q.RouteId, ct) ?? throw new NotFoundException("Versioned route", q.RouteId);
        var revision = q.RevisionId.HasValue ? await repo.FindRevisionAsync(q.RevisionId.Value, ct) : await repo.GetCurrentRevisionAsync(q.RouteId, ct);
        if (revision is null || revision.RouteId != q.RouteId) throw new NotFoundException("Route revision", q.RevisionId ?? Guid.Empty);
        return await RouteRevisionMapper.Load(repo, route.Id, revision.Id, q.IncludeHistory, ct);
    }
}

internal static class RouteRevisionMapper
{
    public static async Task<RouteRevisionView> Load(IRouteRevisionRepository repo, Guid routeId, Guid revisionId, bool history, CancellationToken ct)
    {
        var route = await repo.FindRouteAsync(routeId, ct) ?? throw new NotFoundException("Versioned route", routeId);
        var revision = await repo.FindRevisionAsync(revisionId, ct) ?? throw new NotFoundException("Route revision", revisionId);
        var map = await repo.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Map version", revision.MapVersionId);
        var stops = await repo.GetStopsAsync(revision.Id, ct);
        var eligibilityIssues = new List<string>();
        foreach (var stop in stops)
        {
            var poi = await repo.FindPoiRevisionAsync(stop.PoiProposalRevisionId, ct);
            var source = await repo.FindPoiVerificationAsync(stop.SourcePoiVerificationRecordId, ct);
            var latestPoiResult = poi is null ? null : await repo.GetEffectivePoiVerificationAsync(poi.ProposalId, poi.NavigationFingerprint, ct);
            if (poi is null || source is null || source.ResultCode != "PASS" || latestPoiResult is null || latestPoiResult.ResultCode != "PASS")
                eligibilityIssues.Add($"POI_VERIFICATION_REQUIRED:{stop.PoiProposalRevisionId:D}");
        }
        var submissions = await repo.GetSubmissionsAsync(revision.Id, ct);
        var targetNavigation = RouteNavigationConfigurationFactory.FromRevision(revision, stops);
        var routeRuns = await repo.GetTestRunsForRouteAsync(route.Id, ct);
        var effectiveConfigurationRuns = routeRuns.Where(run => run.RouteRevision is not null &&
            RouteNavigationConfigurationFactory.SameNavigation(
                RouteNavigationConfigurationFactory.FromRevision(run.RouteRevision, run.RouteRevision.RouteRevisionStops.ToArray()), targetNavigation))
            .OrderBy(r => r.CheckedAt).ThenBy(r => r.Id).ToArray();
        var runs = history ? routeRuns : effectiveConfigurationRuns;
        var effective = effectiveConfigurationRuns.LastOrDefault();
        var duration = "INCOMPLETE_CONTENT_AUDIO_DATA";
        var dwell = stops.Sum(s => s.DwellSeconds);
        var dtoRuns = new List<RouteTestRunView>(runs.Count);
        foreach (var r in runs)
            dtoRuns.Add(new RouteTestRunView(r.Id, r.RouteRevisionId, r.MapVersionId,
                Convert.ToHexString(r.MapPackageSha256).ToLowerInvariant(),
                await repo.GetRobotCodeAsync(r.RobotId, ct) ?? "", r.CheckedByUserId,
                r.ParticipatingStaffUserId, r.ResultCode, r.AllStopsReached, r.SafelyStopped, r.LocalizationPassed,
                r.MeasuredDurationSeconds, r.FailureReason, r.EvidenceNote, r.CheckedAt));
        var revisionRecords = await repo.GetRevisionsAsync(route.Id, submittedOnly: false, ct);
        var summaries = new List<RouteRevisionSummaryView>();
        foreach (var historical in revisionRecords.Where(r => history || r.Id == revision.Id).OrderBy(r => r.RevisionNumber))
        {
            var historicalStops = await repo.GetStopsAsync(historical.Id, ct);
            var historicalNavigation = RouteNavigationConfigurationFactory.FromRevision(historical, historicalStops);
            var historicalRuns = routeRuns.Where(run => run.RouteRevision is not null &&
                RouteNavigationConfigurationFactory.SameNavigation(
                    RouteNavigationConfigurationFactory.FromRevision(run.RouteRevision, run.RouteRevision.RouteRevisionStops.ToArray()), historicalNavigation))
                .OrderBy(run => run.CheckedAt).ThenBy(run => run.Id);
            var last = historicalRuns.LastOrDefault();
            summaries.Add(new RouteRevisionSummaryView(historical.Id, historical.RevisionNumber, historical.MapVersionId,
                Convert.ToHexString(historical.MapPackageSha256).ToLowerInvariant(),
                Convert.ToHexString(historical.NavigationFingerprint).ToLowerInvariant(),
                (await repo.GetSubmissionsAsync(historical.Id, ct)).Count > 0, last?.ResultCode ?? "NOT_TESTED", last?.Id, historical.CreatedAt));
        }
        return new RouteRevisionView(route.Id, revision.Id, revision.RevisionNumber, revision.Name, revision.Description,
            map.Id, map.MapKey, Convert.ToHexString(map.PackageSha256).ToLowerInvariant(), revision.StartX, revision.StartY,
            revision.StartYaw, revision.EndMode, revision.EndX, revision.EndY, revision.EndYaw,
            Convert.ToHexString(revision.NavigationFingerprint).ToLowerInvariant(), submissions.Count > 0,
            effective?.ResultCode ?? "NOT_TESTED", effective?.Id, duration, dwell,
            stops.Select(s => new RouteRevisionStopView(s.PoiProposalRevisionId, s.SourcePoiVerificationRecordId,
                s.StopOrder, s.DwellSeconds, Route.ReadHeadSteps(s.HeadStepsJson), s.Name, s.X, s.Y, s.Yaw, s.CameraPreset)).ToArray(), dtoRuns, summaries, eligibilityIssues);
    }
}
