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

public sealed record SaveRouteRevisionCommand(Guid ActorUserId, Guid? RouteId, RouteRevisionDraftInput Input)
    : IRouteMutationCommand<RouteRevisionView>;
public sealed class RouteRevisionDraftValidator : AbstractValidator<SaveRouteRevisionCommand>
{
    public RouteRevisionDraftValidator()
    {
        RuleFor(c => c.Input.RequestId).NotEmpty();
        RuleFor(c => c.Input.ExpectedCurrentRevision).GreaterThanOrEqualTo(0);
        RuleFor(c => c.Input.Name).NotEmpty().MaximumLength(150);
        RuleFor(c => c.Input.Description).MaximumLength(1000);
        RuleFor(c => c.Input.MapVersionId).NotEmpty();
        RuleFor(c => c.Input.StartX).Must(Route.Coordinate);
        RuleFor(c => c.Input.StartY).Must(Route.Coordinate);
        RuleFor(c => c.Input.StartYaw).Must(Route.Heading);
        RuleFor(c => c.Input.EndMode).Must(value => value is "POSE" or "LAST_POI");
        RuleFor(c => c.Input.EndX).Must(value => !value.HasValue || Route.Coordinate(value.Value));
        RuleFor(c => c.Input.EndY).Must(value => !value.HasValue || Route.Coordinate(value.Value));
        RuleFor(c => c.Input.EndYaw).Must(value => !value.HasValue || Route.Heading(value.Value));
        RuleFor(c => c.Input.Stops).NotNull().Must(stops => stops is { Count: > 0 and <= 100 });
        RuleForEach(c => c.Input.Stops).ChildRules(stop =>
        {
            stop.RuleFor(s => s.PoiRevisionId).NotEmpty();
            stop.RuleFor(s => s.DwellSeconds).InclusiveBetween(1, 3600);
            stop.RuleFor(s => s.HeadSteps).NotNull().Must(steps => steps is { Count: > 0 and <= 100 });
            stop.RuleForEach(s => s.HeadSteps).ChildRules(step =>
            {
                step.RuleFor(x => x.Preset).Must(v => v is "FRONT" or "LEFT" or "RIGHT");
                step.RuleFor(x => x.HoldSeconds).GreaterThan(0);
            });
        });
        RuleFor(c => c).Must(c => c.Input.Stops is not null && c.Input.Stops.All(s =>
            s.HeadSteps is not null && s.HeadSteps.Sum(h => (long)h.HoldSeconds) <= s.DwellSeconds))
            .WithMessage("Head-step holds must fit within the configured stop dwell.");
        RuleFor(c => c).Must(c => c.Input.Stops is not null &&
            c.Input.Stops.Select(s => s.PoiRevisionId).Distinct().Count() == c.Input.Stops.Count)
            .WithMessage("A POI revision may appear only once in a fixed route.");
        RuleFor(c => c).Must(c => c.Input.EndMode != "POSE" ||
            c.Input.EndX.HasValue && c.Input.EndY.HasValue && c.Input.EndYaw.HasValue)
            .WithMessage("POSE end mode requires end X, Y and yaw.");
        RuleFor(c => c).Must(c => c.Input.EndMode != "LAST_POI" ||
            !c.Input.EndX.HasValue && !c.Input.EndY.HasValue && !c.Input.EndYaw.HasValue)
            .WithMessage("LAST_POI end mode must not include an end pose.");
    }
}

public sealed class SaveRouteRevisionHandler(IRouteRevisionRepository repo, IMapVersionRepository mapRepository, MapPoiSettings settings, TimeProvider clock)
    : IRequestHandler<SaveRouteRevisionCommand, RouteRevisionView>
{
    public async Task<RouteRevisionView> Handle(SaveRouteRevisionCommand c, CancellationToken ct)
    {
        var i = c.Input;
        var hash = Hash(new { c.RouteId, i.ExpectedCurrentRevision, i.Name, i.Description, i.MapVersionId,
            i.StartX, i.StartY, i.StartYaw, i.EndMode, i.EndX, i.EndY, i.EndYaw, i.Stops });
        await repo.LockRequestAsync(c.ActorUserId, i.RequestId, "save", ct);
        var prior = await repo.FindRequestAsync(c.ActorUserId, i.RequestId, ct);
        if (prior is not null)
        {
            EnsureHash(prior.RequestHash, hash);
            return await RouteRevisionMapper.Load(repo, prior.RouteId, prior.Id, true, ct);
        }

        Route? route;
        RouteRevision? current = null;
        if (c.RouteId.HasValue)
        {
            route = await repo.LockRouteAsync(c.RouteId.Value, ct) ?? throw new NotFoundException("Versioned route", c.RouteId.Value);
            current = await repo.GetCurrentRevisionAsync(route.Id, ct);
            if (current?.RevisionNumber != i.ExpectedCurrentRevision)
                throw new ConflictException("Route revision changed; reload history before saving.", "STALE_ROUTE_REVISION");
        }
        else
        {
            if (i.ExpectedCurrentRevision != 0) throw new ConflictException("A new route must start at revision zero.", "STALE_ROUTE_REVISION");
            route = null;
        }

        var map = await repo.GetMapAsync(i.MapVersionId, ct) ?? throw new NotFoundException("Map version", i.MapVersionId);
        await mapRepository.LockMapPreparationStateAsync(map.Id, ct);
        (await MapPreparationEligibility.LoadAsync(mapRepository, map, ct)).EnsureCanUse();
        var poiIds = i.Stops.Select(s => s.PoiRevisionId).ToArray();
        var evidence = await repo.GetPoiEvidenceAsync(poiIds, ct);
        if (evidence.Count != poiIds.Length) throw new ConflictException("Every selected POI revision must have effective technical verification evidence.", "POI_VERIFICATION_REQUIRED");
        var byId = evidence.ToDictionary(e => e.Revision.Id);
        foreach (var id in poiIds)
        {
            var selected = byId[id];
            if (selected.Revision.MapVersionId != map.Id || selected.Verification.MapVersionId != map.Id)
                throw new ConflictException("All POI revisions and their verification evidence must use the selected exact map version.", "MAP_VERSION_MISMATCH");
            if (selected.Verification.ResultCode != "PASS" || !CryptographicOperations.FixedTimeEquals(selected.Revision.NavigationFingerprint, selected.Verification.NavigationFingerprint))
                throw new ConflictException("Every selected POI revision must have an effective PASS for its navigation fingerprint.", "POI_VERIFICATION_REQUIRED");
            var latest = await repo.GetEffectivePoiVerificationAsync(selected.Revision.ProposalId, selected.Revision.NavigationFingerprint, ct);
            if (latest?.Id != selected.Verification.Id || latest.ResultCode != "PASS")
                throw new ConflictException("A newer POI verification result supersedes the selected PASS.", "POI_VERIFICATION_STALE");
            if (string.IsNullOrWhiteSpace(selected.Revision.NarrationText))
                throw new ConflictException($"POI {selected.Revision.Name} chưa có nội dung thuyết minh. Bổ sung nội dung rồi chọn lại phiên bản mới.", "POI_NARRATION_REQUIRED");
        }
        var package = MapPackageValidator.Validate(map.PackageBytes);
        var previous = current?.MapVersionId == map.Id ? current : null;
        EnsureWrittenPose(package, i.StartX, i.StartY, i.StartYaw, previous?.StartX, previous?.StartY);
        if (i.EndMode == "POSE")
        {
            var endX = i.EndX ?? throw new ValidationException("End pose X is required.");
            var endY = i.EndY ?? throw new ValidationException("End pose Y is required.");
            var endYaw = i.EndYaw ?? throw new ValidationException("End pose yaw is required.");
            EnsureWrittenPose(package, endX, endY, endYaw, previous?.EndX, previous?.EndY);
        }

        var now = clock.GetUtcNow();
        var routeId = route?.Id ?? Guid.NewGuid();
        var number = i.ExpectedCurrentRevision + 1;
        if (route is null)
        {
            route = new Route { Id = routeId, AuthoringMode = "VERSIONED", Name = i.Name.Trim(), Description = Clean(i.Description),
                MapKey = map.MapKey, MapFrame = map.FrameId, StartX = i.StartX, StartY = i.StartY, StartYaw = i.StartYaw,
                EndMode = i.EndMode, EndX = i.EndX, EndY = i.EndY, EndYaw = i.EndYaw, IsActive = true, CreatedAt = now };
            repo.Add(route);
        }
        var fingerprint = ConfigurationFingerprint(map.Id, map.PackageSha256, i, evidence);
        var targetNavigation = RouteNavigationConfigurationFactory.FromDraft(map.Id, map.PackageSha256, i, byId);
        var retainedRouteRuns = route is null ? Array.Empty<RouteTestRun>() : await repo.GetTestRunsForRouteAsync(route.Id, ct);
        var inheritedRun = retainedRouteRuns
            .Where(run => run.RouteRevision is not null && RouteNavigationConfigurationFactory.SameNavigation(
                RouteNavigationConfigurationFactory.FromRevision(run.RouteRevision, run.RouteRevision.RouteRevisionStops.ToArray()), targetNavigation))
            .OrderBy(run => run.CheckedAt).ThenBy(run => run.Id).LastOrDefault();
        var revision = new RouteRevision
        {
            Id = Guid.NewGuid(), RouteId = routeId, RevisionNumber = number, Name = i.Name.Trim(), Description = Clean(i.Description),
            MapVersionId = map.Id, MapPackageSha256 = map.PackageSha256, StartX = i.StartX, StartY = i.StartY, StartYaw = i.StartYaw,
            EndMode = i.EndMode, EndX = i.EndX, EndY = i.EndY, EndYaw = i.EndYaw,
            NavigationFingerprint = fingerprint, RequestId = i.RequestId, RequestHash = hash,
            CreatedByUserId = c.ActorUserId, CreatedAt = now
        };
        revision.Route = route!;
        repo.Add(revision);
        for (var index = 0; index < i.Stops.Count; index++)
        {
            var selected = byId[i.Stops[index].PoiRevisionId];
            repo.Add(new RouteRevisionStop { Id = Guid.NewGuid(), RouteRevisionId = revision.Id, RouteRevision = revision,
                PoiProposalRevisionId = selected.Revision.Id, SourcePoiVerificationRecordId = selected.Verification.Id,
                MapVersionId = map.Id, PoiNavigationFingerprint = selected.Revision.NavigationFingerprint,
                StopOrder = index + 1, DwellSeconds = i.Stops[index].DwellSeconds,
                HeadStepsJson = Route.WriteHeadSteps(i.Stops[index].HeadSteps), Name = selected.Revision.Name,
                NarrationText = selected.Revision.NarrationText, FallbackVideoUrl = selected.Revision.FallbackVideoUrl,
                X = selected.Revision.X, Y = selected.Revision.Y, Yaw = selected.Revision.Yaw, CameraPreset = selected.Revision.CameraPreset });
        }
        repo.AddAudit(new AuditLog { ActorUserId = c.ActorUserId, Action = "ROUTE_REVISION_CREATED", EntityType = "RouteRevision",
            EntityId = revision.Id.ToString("D"), ResultCode = "DRAFT", DataJson = JsonSerializer.Serialize(new { routeId, number, map.Id, map.PackageSha256 }), OccurredAt = now });
        IReadOnlyList<RouteTestRunView> inheritedTestRuns = inheritedRun is null ? [] :
        [new RouteTestRunView(inheritedRun.Id, inheritedRun.RouteRevisionId, inheritedRun.MapVersionId,
            Convert.ToHexString(inheritedRun.MapPackageSha256).ToLowerInvariant(),
            await repo.GetRobotCodeAsync(inheritedRun.RobotId, ct) ?? "", inheritedRun.CheckedByUserId,
            inheritedRun.ParticipatingStaffUserId, inheritedRun.ResultCode, inheritedRun.AllStopsReached,
            inheritedRun.SafelyStopped, inheritedRun.LocalizationPassed, inheritedRun.MeasuredDurationSeconds,
            inheritedRun.FailureReason, inheritedRun.EvidenceNote, inheritedRun.CheckedAt, inheritedRun.MeasurementBasis)];
        return new RouteRevisionView(routeId, revision.Id, number, revision.Name, revision.Description, map.Id, map.MapKey,
            Convert.ToHexString(map.PackageSha256).ToLowerInvariant(), revision.StartX, revision.StartY, revision.StartYaw,
            revision.EndMode, revision.EndX, revision.EndY, revision.EndYaw,
            Convert.ToHexString(fingerprint).ToLowerInvariant(), false, inheritedRun?.ResultCode ?? "NOT_TESTED", inheritedRun?.Id,
            "INCOMPLETE_CONTENT_AUDIO_DATA", i.Stops.Sum(s => s.DwellSeconds),
            i.Stops.Select((s, index) =>
            {
                var selected = byId[s.PoiRevisionId];
                return new RouteRevisionStopView(selected.Revision.Id, selected.Verification.Id, index + 1, s.DwellSeconds,
                    s.HeadSteps, selected.Revision.Name, selected.Revision.X, selected.Revision.Y, selected.Revision.Yaw,
                    selected.Revision.CameraPreset, selected.Revision.NarrationText, selected.Revision.FallbackVideoUrl);
            }).ToArray(), inheritedTestRuns, [new RouteRevisionSummaryView(revision.Id, number, map.Id,
                Convert.ToHexString(map.PackageSha256).ToLowerInvariant(), Convert.ToHexString(fingerprint).ToLowerInvariant(), false,
                inheritedRun?.ResultCode ?? "NOT_TESTED", inheritedRun?.Id, revision.CreatedAt)], []);
    }

    // A pose kept from the current revision on the same map may predate the clearance rule; see PoiProposalRules.
    private void EnsureWrittenPose(ValidatedMapPackage package, decimal x, decimal y, decimal yaw, decimal? previousX, decimal? previousY)
    {
        if (x == previousX && y == previousY) MapPackageValidator.EnsureFreePosition(package, x, y, yaw);
        else MapPackageValidator.EnsureClearPosition(package, x, y, yaw, settings.PoiClearanceMeters);
    }

    internal static string Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null! : value.Trim();
    internal static byte[] Hash<T>(T value) => SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value));
    internal static void EnsureHash(byte[] prior, byte[] current)
    {
        if (!CryptographicOperations.FixedTimeEquals(prior, current)) throw new ConflictException("RequestId was already used with different route revision content.", "IDEMPOTENCY_CONFLICT");
    }
    internal static byte[] ConfigurationFingerprint(Guid mapId, byte[] checksum, RouteRevisionDraftInput input, IReadOnlyList<RoutePoiRevisionEvidence> evidence) =>
        Hash(new { mapId, Checksum = Convert.ToHexString(checksum), input.StartX, input.StartY, input.StartYaw, input.EndMode, input.EndX, input.EndY, input.EndYaw,
            Stops = input.Stops.Select((s, index) =>
            {
                var poi = evidence.Single(e => e.Revision.Id == s.PoiRevisionId).Revision;
                return new { NavigationFingerprint = Convert.ToHexString(poi.NavigationFingerprint),
                    Order = index + 1, poi.CameraPreset, HeadSteps = s.HeadSteps };
            }) });
}
