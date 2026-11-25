using System.Security.Cryptography;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>One stop of a Tour and the narration it would say: the Tour's snapshot and the POI's newest approved text.</summary>
public sealed record TourNarrationStopView(Guid StopId, int StopOrder, string Name, string? CurrentText,
    string? ApprovedText, int? ApprovedRevisionNumber, bool HasNewer);

/// <summary>
/// ADR-0067: whether a Tour still to run can take the newest approved narration of its POIs. <see cref="BlockedCode"/>
/// is null when it can; otherwise one of <see cref="TourNarrationRefresh"/>'s codes, with a sentence for Staff.
/// </summary>
public sealed record TourNarrationStatus(Guid TourId, Guid? RouteRevisionId, int? RouteRevisionNumber, bool CanRefresh,
    string? BlockedCode, string? BlockedReason, IReadOnlyList<TourNarrationStopView> Stops);

/// <summary>The Tour now runs <see cref="RouteRevisionId"/>; <see cref="UpdatedStops"/> name the stops whose text changed.</summary>
public sealed record TourNarrationRefreshResult(Guid Id, Guid RouteRevisionId, int RouteRevisionNumber,
    IReadOnlyList<string> UpdatedStops);

/// <summary>
/// ADR-0067. A Tour keeps the narration snapshotted in its route revision (ADR-0060). Before Start, Staff may move it to
/// a revision of the same route that differs only in narration: same map, start, end, POI revisions, order, dwell and
/// camera steps, so the same navigation fingerprint and the same applied test run (ADR-0023 addendum). Anything else
/// still needs a new Tour.
/// </summary>
public static class TourNarrationRefresh
{
    public const string UpToDateCode = "TOUR_NARRATION_UP_TO_DATE";
    public const string RouteChangedCode = "TOUR_ROUTE_CHANGED";
    public const string LockedCode = "TOUR_LOCKED";
    public const string LegacyCode = "ROUTE_VERSION_REQUIRED";

    public const string UpToDateMessage = "Tour đã dùng lời thuyết minh đã duyệt mới nhất của mọi điểm dừng.";
    public const string RouteChangedMessage =
        "Tuyến đã có bản mới đổi điểm dừng, thời gian dừng hoặc đường đi. Chỉ cập nhật được lời thuyết minh khi đường đi giữ nguyên; muốn Tour theo bản mới, hủy Tour rồi tạo lại.";
    public const string LockedMessage = "Chỉ cập nhật được lời thuyết minh trước khi Tour bắt đầu.";
    public const string LegacyMessage = "Tour kiểu cũ không có phiên bản tuyến để cập nhật lời thuyết minh.";

    /// <summary>What a refresh would do for the Tour's revision, read without locks.</summary>
    public sealed record Plan(RouteRevision TourRevision, IReadOnlyList<RouteRevisionStop> TourStops, RouteRevision Latest,
        IReadOnlyList<RouteRevisionStop> LatestStops, bool LatestSamePath, bool LatestNarrationCurrent, bool LatestSubmitted,
        IReadOnlyList<TourNarrationStopView> Stops)
    {
        public bool HasNewer => Stops.Any(stop => stop.HasNewer);
    }

    public static async Task<Plan> PlanAsync(IRouteRevisionRepository revisions, Guid tourRevisionId, CancellationToken ct)
    {
        var tourRevision = await revisions.FindRevisionAsync(tourRevisionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến của Tour.");
        var tourStops = Ordered(await revisions.GetStopsAsync(tourRevision.Id, ct));
        var latest = await revisions.GetCurrentRevisionAsync(tourRevision.RouteId, ct) ?? tourRevision;
        var latestStops = latest.Id == tourRevision.Id ? tourStops : Ordered(await revisions.GetStopsAsync(latest.Id, ct));

        var poiRevisionIds = tourStops.Concat(latestStops).Select(stop => stop.PoiProposalRevisionId).Distinct().ToArray();
        var proposalOf = (await revisions.FindPoiRevisionsAsync(poiRevisionIds, ct)).ToDictionary(poi => poi.Id, poi => poi.ProposalId);
        var approved = (await revisions.GetApprovedNarrationsAsync(proposalOf.Values.Distinct().ToArray(), ct))
            .ToDictionary(narration => narration.ProposalId);
        PoiNarrationRevision? ApprovedFor(RouteRevisionStop stop) =>
            proposalOf.TryGetValue(stop.PoiProposalRevisionId, out var proposal) && approved.TryGetValue(proposal, out var n) ? n : null;

        var stops = tourStops.Select(stop => StopView(stop, ApprovedFor(stop))).ToArray();
        var samePath = SamePath(tourRevision, tourStops, latest, latestStops);
        var latestCurrent = latestStops.All(stop => ApprovedFor(stop) is not { } n || n.Id == stop.NarrationRevisionId);
        var submitted = (await revisions.GetSubmissionsAsync(latest.Id, ct)).Count > 0;
        return new Plan(tourRevision, tourStops, latest, latestStops, samePath, latestCurrent, submitted, stops);
    }

    /// <summary>A stop has newer narration when its POI has an approved text other than the one the stop snapshotted.</summary>
    public static TourNarrationStopView StopView(RouteRevisionStop stop, PoiNarrationRevision? approved) =>
        new(stop.Id, stop.StopOrder, stop.Name, stop.NarrationText, approved?.NarrationText, approved?.RevisionNumber,
            approved is not null && approved.Id != stop.NarrationRevisionId);

    /// <summary>
    /// Whether two revisions drive the same Tour: equal navigation fingerprint (map, start, end, POI navigation, order,
    /// camera steps, vote flag) and, stop by stop, the same POI revision and dwell. Name, description and narration may
    /// differ.
    /// </summary>
    public static bool SamePath(RouteRevision a, IReadOnlyList<RouteRevisionStop> aStops, RouteRevision b,
        IReadOnlyList<RouteRevisionStop> bStops)
    {
        if (a.RouteId != b.RouteId || a.MapVersionId != b.MapVersionId || a.ViewerChoosesNextStop != b.ViewerChoosesNextStop
            || !CryptographicOperations.FixedTimeEquals(a.NavigationFingerprint, b.NavigationFingerprint)) return false;
        var (left, right) = (Ordered(aStops), Ordered(bStops));
        if (left.Count != right.Count) return false;
        for (var index = 0; index < left.Count; index++)
            if (left[index].PoiProposalRevisionId != right[index].PoiProposalRevisionId
                || left[index].DwellSeconds != right[index].DwellSeconds
                || !Route.ReadHeadSteps(left[index].HeadStepsJson).SequenceEqual(Route.ReadHeadSteps(right[index].HeadStepsJson)))
                return false;
        return true;
    }

    /// <summary>The save request that repeats <paramref name="latest"/> exactly; the save snapshots the newest approved narration.</summary>
    public static RouteRevisionDraftInput RepeatInput(RouteRevision latest, IReadOnlyList<RouteRevisionStop> stops, Guid requestId) =>
        new(requestId, latest.RevisionNumber, latest.Name, latest.Description, latest.MapVersionId,
            latest.StartX, latest.StartY, latest.StartYaw, latest.EndMode, latest.EndX, latest.EndY, latest.EndYaw,
            Ordered(stops).Select(stop => new RouteRevisionStopInput(stop.PoiProposalRevisionId, stop.DwellSeconds,
                Route.ReadHeadSteps(stop.HeadStepsJson).ToArray())).ToArray(),
            latest.ViewerChoosesNextStop);

    /// <summary>A request id derived from the Tour request, so a retried refresh repeats the same route save and submit.</summary>
    public static Guid DerivedRequestId(Guid requestId, string step)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{requestId:D}:{step}"))[..16];
        bytes[7] = (byte)((bytes[7] & 0x0F) | 0x50);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes);
    }

    /// <summary>Null when Staff may refresh now; otherwise the code and sentence the page and the command both use.</summary>
    public static (string Code, string Message)? Blocker(Tour tour, TourPermissions permissions, Plan? plan)
    {
        if (tour.RouteRevisionId is null || plan is null) return (LegacyCode, LegacyMessage);
        if (!permissions.CanRefreshNarration) return (LockedCode, LockedMessage);
        if (!plan.HasNewer) return (UpToDateCode, UpToDateMessage);
        if (!plan.LatestSamePath) return (RouteChangedCode, RouteChangedMessage);
        return null;
    }

    private static IReadOnlyList<RouteRevisionStop> Ordered(IReadOnlyList<RouteRevisionStop> stops) =>
        stops.OrderBy(stop => stop.StopOrder).ToArray();
}
