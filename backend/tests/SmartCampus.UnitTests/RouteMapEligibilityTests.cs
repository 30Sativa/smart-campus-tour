using System.Reflection;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class RouteMapEligibilityTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly MapVersion Map = new() { Id = Guid.NewGuid(), PackageSha256 = new byte[32] };
    private static readonly Route Route = new() { Id = Guid.NewGuid() };
    private static readonly RouteRevision Revision = new()
    {
        Id = Guid.NewGuid(), RouteId = Route.Id, RevisionNumber = 1, MapVersionId = Map.Id
    };

    [Fact]
    public async Task Save_is_rejected_before_any_write_when_map_has_no_check()
    {
        var calls = new List<string>();
        var handler = new SaveRouteRevisionHandler(RouteRepository(calls), MapRepository([], calls), new MapPoiSettings(null), new RouteRuleSettings(null, null), TourShiftsFixture.Settings, TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new SaveRouteRevisionCommand(ActorId, null, Draft()), default));

        Assert.Equal("TECHNICAL_CHECK_PENDING", error.Code);
        Assert.DoesNotContain(calls, call => call is nameof(IRouteRevisionRepository.Add) or nameof(IRouteRevisionRepository.AddAudit));
        Assert.True(calls.IndexOf(nameof(IMapVersionRepository.LockMapPreparationStateAsync)) <
            calls.IndexOf(nameof(IMapVersionRepository.ListDeploymentChecksForMapAsync)));
    }

    [Fact]
    public async Task Save_is_rejected_when_the_latest_check_on_the_map_failed()
    {
        var handler = new SaveRouteRevisionHandler(RouteRepository([]), MapRepository([Check(passed: false)], []), new MapPoiSettings(null), new RouteRuleSettings(null, null), TourShiftsFixture.Settings, TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new SaveRouteRevisionCommand(ActorId, null, Draft()), default));

        Assert.Equal("TECHNICAL_CHECK_NOT_PASSED", error.Code);
    }

    [Fact]
    public async Task Submit_is_rejected_before_receipt_or_audit_when_map_lost_its_passing_check()
    {
        var calls = new List<string>();
        var handler = new SubmitRouteRevisionHandler(RouteRepository(calls), MapRepository([Check(passed: false)], calls), TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new SubmitRouteRevisionCommand(ActorId, Route.Id, Revision.Id, new RouteRevisionRequest(Guid.NewGuid(), 1)), default));

        Assert.Equal("TECHNICAL_CHECK_NOT_PASSED", error.Code);
        Assert.DoesNotContain(calls, call => call is nameof(IRouteRevisionRepository.Add) or nameof(IRouteRevisionRepository.AddAudit));
    }

    [Fact]
    public async Task Submit_passes_the_gate_when_the_map_has_a_passing_check()
    {
        var calls = new List<string>();
        var handler = new SubmitRouteRevisionHandler(RouteRepository(calls), MapRepository([Check(passed: true)], calls), TimeProvider.System);

        // The stub ends at the next step after the gate, which proves the gate let it through.
        await Assert.ThrowsAsync<NotImplementedException>(() => handler.Handle(
            new SubmitRouteRevisionCommand(ActorId, Route.Id, Revision.Id, new RouteRevisionRequest(Guid.NewGuid(), 1)), default));

        Assert.Contains(nameof(IRouteRevisionRepository.GetStopsAsync), calls);
    }

    private static RouteRevisionDraftInput Draft() => new(Guid.NewGuid(), 0, "Pilot", null, Map.Id, 0m, 0m, 0m, "LAST_POI", null, null, null,
        [new(Guid.NewGuid(), 30, [new("FRONT", 30)]), new(Guid.NewGuid(), 30, [new("FRONT", 30)])]);

    private static MapDeploymentCheck Check(bool passed) => new()
    {
        Id = Guid.NewGuid(), MapVersionId = Map.Id, RobotId = Guid.NewGuid(), Robot = new Robot { SourceType = "PHYSICAL" },
        PackageSha256 = new byte[32], LocalizationPassed = passed, DisplayPassed = true, CheckedAt = DateTimeOffset.UtcNow
    };

    private static IRouteRevisionRepository RouteRepository(List<string> calls) => Proxy<IRouteRevisionRepository>(method =>
    {
        calls.Add(method.Name);
        return method.Name switch
        {
            nameof(IRouteRevisionRepository.LockRequestAsync) => Task.CompletedTask,
            nameof(IRouteRevisionRepository.FindRequestAsync) => Task.FromResult<RouteRevision?>(null),
            nameof(IRouteRevisionRepository.FindSubmissionRequestAsync) => Task.FromResult<RouteRevisionSubmission?>(null),
            nameof(IRouteRevisionRepository.GetMapAsync) => Task.FromResult<MapVersion?>(Map),
            nameof(IRouteRevisionRepository.LockRouteAsync) => Task.FromResult<Route?>(Route),
            nameof(IRouteRevisionRepository.GetCurrentRevisionAsync) => Task.FromResult<RouteRevision?>(Revision),
            nameof(IRouteRevisionRepository.GetSubmissionsAsync) => Task.FromResult<IReadOnlyList<RouteRevisionSubmission>>([]),
            _ => throw new NotImplementedException(method.Name)
        };
    });

    private static IMapVersionRepository MapRepository(IReadOnlyList<MapDeploymentCheck> checks, List<string> calls) => Proxy<IMapVersionRepository>(method =>
    {
        calls.Add(method.Name);
        return method.Name switch
        {
            nameof(IMapVersionRepository.FindMapVersionAsync) => Task.FromResult<MapVersion?>(Map),
            nameof(IMapVersionRepository.ListDeploymentChecksForMapAsync) => Task.FromResult(checks),
            nameof(IMapVersionRepository.LockMapPreparationStateAsync) => Task.CompletedTask,
            _ => throw new NotImplementedException(method.Name)
        };
    });

    private static T Proxy<T>(Func<MethodInfo, object?> handler) where T : class
    {
        var proxy = DispatchProxy.Create<T, StubProxy>();
        ((StubProxy)(object)proxy).Handler = handler;
        return proxy;
    }

    public class StubProxy : DispatchProxy
    {
        internal Func<MethodInfo, object?> Handler { get; set; } = null!;
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
            Handler(targetMethod ?? throw new InvalidOperationException("Missing method metadata."));
    }
}
