using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public sealed record RecordRouteTestRunCommand(Guid ActorUserId, Guid RouteId, Guid RevisionId, RouteRunRequest Request)
    : IRouteMutationCommand<RouteRevisionView>;
public sealed class RecordRouteTestRunValidator : AbstractValidator<RecordRouteTestRunCommand>
{
    public RecordRouteTestRunValidator()
    {
        RuleFor(c => c.RouteId).NotEmpty(); RuleFor(c => c.RevisionId).NotEmpty();
        RuleFor(c => c.Request.RequestId).NotEmpty(); RuleFor(c => c.Request.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(c => c.Request.ParticipatingStaffUserId).NotEmpty();
        RuleFor(c => c.Request.ResultCode).Must(v => v is "PASS" or "FAIL" or "pass" or "fail" or "Pass" or "Fail");
        RuleFor(c => c.Request.MeasuredDurationSeconds).InclusiveBetween(1, 86400);
        RuleFor(c => c.Request.EvidenceNote).NotEmpty().MaximumLength(2000);
        RuleFor(c => c.Request.FailureReason).MaximumLength(1000);
        RuleFor(c => c).Must(c => c.Request.ResultCode.ToUpperInvariant() != "PASS" ||
            c.Request.AllStopsReached && c.Request.SafelyStopped && c.Request.LocalizationPassed)
            .WithMessage("PASS requires all stops reached, localization passed and safe stop observed.");
        RuleFor(c => c).Must(c => c.Request.ResultCode.ToUpperInvariant() != "FAIL" ||
            !string.IsNullOrWhiteSpace(c.Request.FailureReason) &&
            (!c.Request.AllStopsReached || !c.Request.SafelyStopped || !c.Request.LocalizationPassed))
            .WithMessage("FAIL requires a reason and at least one failed route observation.");
    }
}

public sealed class RecordRouteTestRunHandler(IRouteRevisionRepository repo, TimeProvider clock)
    : IRequestHandler<RecordRouteTestRunCommand, RouteRevisionView>
{
    public async Task<RouteRevisionView> Handle(RecordRouteTestRunCommand c, CancellationToken ct)
    {
        var q = c.Request; var result = q.ResultCode.Trim().ToUpperInvariant();
        var hash = SaveRouteRevisionHandler.Hash(new { c.RouteId, c.RevisionId, q.RobotCode, q.ParticipatingStaffUserId,
            Result = result, q.AllStopsReached, q.SafelyStopped, q.LocalizationPassed, q.MeasuredDurationSeconds,
            q.FailureReason, q.EvidenceNote });
        await repo.LockRequestAsync(c.ActorUserId, q.RequestId, "test", ct);
        var prior = await repo.FindTestRequestAsync(c.ActorUserId, q.RequestId, ct);
        if (prior is not null)
        {
            SaveRouteRevisionHandler.EnsureHash(prior.RequestHash, hash);
            return await RouteRevisionMapper.Load(repo, c.RouteId, c.RevisionId, true, ct);
        }
        var route = await repo.LockRouteAsync(c.RouteId, ct) ?? throw new NotFoundException("Versioned route", c.RouteId);
        var revision = await repo.FindRevisionAsync(c.RevisionId, ct) ?? throw new NotFoundException("Route revision", c.RevisionId);
        if (revision.RouteId != route.Id || await repo.GetSubmissionsAsync(revision.Id, ct) is not { Count: > 0 })
            throw new ConflictException("Only a submitted route revision can be tested.", "ROUTE_NOT_SUBMITTED");
        await SubmitRouteRevisionHandler.EnsurePoisStillPass(repo, revision.Id, ct);
        var staff = await repo.FindUserAsync(q.ParticipatingStaffUserId, ct);
        if (staff is null || !staff.IsActive ||
            !ApplicationRoles.TryResolve(staff.UserRoles.Select(r => r.Role), out var participantRole) ||
            participantRole != ApplicationRoles.Staff)
            throw new ConflictException("The participating operator must be an active Staff account, recorded explicitly.", "STAFF_PARTICIPANT_REQUIRED");
        if (q.ParticipatingStaffUserId == c.ActorUserId) throw new ConflictException("Technical checker and participating Staff must be distinct accounts.", "SEPARATE_TEST_ROLES_REQUIRED");
        var robot = await repo.FindPhysicalRobotAsync(q.RobotCode.Trim(), ct) ?? throw new NotFoundException("Physical robot", q.RobotCode.Trim());
        await repo.LockRobotDeploymentStateAsync(robot.Id, ct);
        var deployment = await repo.GetLatestDeploymentForRobotAsync(robot.Id, ct);
        var map = await repo.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Map version", revision.MapVersionId);
        if (deployment is null || deployment.Id == Guid.Empty || deployment.MapVersionId != map.Id ||
            !deployment.LocalizationPassed || !deployment.DisplayPassed ||
            !CryptographicOperations.FixedTimeEquals(deployment.PackageSha256, revision.MapPackageSha256) ||
            !CryptographicOperations.FixedTimeEquals(map.PackageSha256, revision.MapPackageSha256))
            throw new ConflictException("The robot's latest deployment check must match the exact map version and checksum in this revision.", "MAP_NOT_CURRENTLY_DEPLOYED");
        var now = clock.GetUtcNow();
        var routeRuns = await repo.GetTestRunsForRouteAsync(route.Id, ct);
        var targetNavigation = RouteNavigationConfigurationFactory.FromRevision(revision,
            await repo.GetStopsAsync(revision.Id, ct));
        var latestForConfiguration = routeRuns.Where(run => run.RouteRevision is not null &&
            RouteNavigationConfigurationFactory.SameNavigation(
                RouteNavigationConfigurationFactory.FromRevision(run.RouteRevision, run.RouteRevision.RouteRevisionStops.ToArray()), targetNavigation))
            .OrderBy(run => run.CheckedAt).ThenBy(run => run.Id).LastOrDefault();
        if (latestForConfiguration is not null && latestForConfiguration.CheckedAt >= now)
            now = latestForConfiguration.CheckedAt.AddMilliseconds(1);
        var run = new RouteTestRun { Id = Guid.NewGuid(), RouteRevisionId = revision.Id, NavigationFingerprint = revision.NavigationFingerprint,
            MapVersionId = map.Id, MapDeploymentCheckId = deployment.Id, MapPackageSha256 = map.PackageSha256, RobotId = robot.Id, CheckedByUserId = c.ActorUserId,
            ParticipatingStaffUserId = q.ParticipatingStaffUserId, ResultCode = result, AllStopsReached = q.AllStopsReached,
            SafelyStopped = q.SafelyStopped, LocalizationPassed = q.LocalizationPassed, MeasuredDurationSeconds = q.MeasuredDurationSeconds,
            FailureReason = string.IsNullOrWhiteSpace(q.FailureReason) ? null : q.FailureReason.Trim(), EvidenceNote = q.EvidenceNote.Trim(),
            RequestId = q.RequestId, RequestHash = hash, CheckedAt = now };
        repo.Add(run);
        repo.AddAudit(new AuditLog { ActorUserId = c.ActorUserId, RobotId = robot.Id, Action = result == "PASS" ? "ROUTE_TEST_PASSED" : "ROUTE_TEST_FAILED",
            EntityType = "RouteRevision", EntityId = revision.Id.ToString("D"), ResultCode = result, OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { revision.RevisionNumber, map.Id, robot.RobotCode, q.ParticipatingStaffUserId, q.MeasuredDurationSeconds }) });
        var view = await RouteRevisionMapper.Load(repo, route.Id, revision.Id, true, ct);
        var testView = new RouteTestRunView(run.Id, run.RouteRevisionId, run.MapVersionId,
            Convert.ToHexString(run.MapPackageSha256).ToLowerInvariant(), robot.RobotCode, run.CheckedByUserId,
            run.ParticipatingStaffUserId, run.ResultCode, run.AllStopsReached, run.SafelyStopped,
            run.LocalizationPassed, run.MeasuredDurationSeconds, run.FailureReason, run.EvidenceNote, run.CheckedAt);
        return view with { VerificationStatus = result, EffectiveTestRunId = run.Id, TestRuns = [.. view.TestRuns, testView] };
    }
}
