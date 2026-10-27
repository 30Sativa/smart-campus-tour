using System.Security.Cryptography;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

internal static class RouteNavigationConfigurationFactory
{
    public static RouteNavigationConfiguration FromDraft(Guid mapVersionId, byte[] mapPackageSha256,
        RouteRevisionDraftInput input, IReadOnlyDictionary<Guid, RoutePoiRevisionEvidence> evidence) =>
        new(mapVersionId, mapPackageSha256, input.StartX, input.StartY, input.StartYaw, input.EndMode,
            input.EndX, input.EndY, input.EndYaw,
            input.Stops.Select((stop, index) =>
            {
                var poi = evidence[stop.PoiRevisionId].Revision;
                return new RouteNavigationStopConfiguration(index + 1, poi.NavigationFingerprint,
                    poi.CameraPreset, stop.HeadSteps);
            }).ToArray());

    public static RouteNavigationConfiguration FromRevision(RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops) =>
        new(revision.MapVersionId, revision.MapPackageSha256, revision.StartX, revision.StartY, revision.StartYaw,
            revision.EndMode, revision.EndX, revision.EndY, revision.EndYaw,
            stops.OrderBy(stop => stop.StopOrder).Select(stop => new RouteNavigationStopConfiguration(
                stop.StopOrder, stop.PoiNavigationFingerprint, stop.CameraPreset, Route.ReadHeadSteps(stop.HeadStepsJson))).ToArray());

    public static bool SameNavigation(RouteNavigationConfiguration left, RouteNavigationConfiguration right) =>
        left.MapVersionId == right.MapVersionId &&
        CryptographicOperations.FixedTimeEquals(left.MapPackageSha256, right.MapPackageSha256) &&
        left.StartX == right.StartX && left.StartY == right.StartY && left.StartYaw == right.StartYaw &&
        left.EndMode == right.EndMode && left.EndX == right.EndX && left.EndY == right.EndY && left.EndYaw == right.EndYaw &&
        left.Stops.Count == right.Stops.Count && left.Stops.Zip(right.Stops).All(pair =>
            pair.First.StopOrder == pair.Second.StopOrder &&
            CryptographicOperations.FixedTimeEquals(pair.First.PoiNavigationFingerprint, pair.Second.PoiNavigationFingerprint) &&
            string.Equals(pair.First.CameraPreset, pair.Second.CameraPreset, StringComparison.Ordinal) &&
            pair.First.HeadSteps.SequenceEqual(pair.Second.HeadSteps));
}
