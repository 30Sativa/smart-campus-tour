using System.Reflection;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>
/// A voting-route run names its driven steps from the revision it was recorded on, so a run carried onto a later save
/// (whose stop ids are new) still reads by POI name on the route-test page.
/// </summary>
public sealed class RouteTestRunTraversedStopsTests
{
    [Fact]
    public async Task A_run_carried_from_an_earlier_save_names_its_steps_from_that_save()
    {
        var map = new MapVersion { Id = Guid.NewGuid(), MapKey = "tang-6-v1", PackageSha256 = [1, 2] };
        var route = new Route { Id = Guid.NewGuid(), Name = "Tham quan", AuthoringMode = "VERSIONED", IsActive = true };
        var first = Revision(route, map, 1);
        var second = Revision(route, map, 2);
        string[] names = ["Thư viện", "Phòng lab", "Hội trường"];
        var firstStops = names.Select((name, index) => Stop(first, index + 1, name)).ToArray();
        var secondStops = names.Select((name, index) => Stop(second, index + 1, name)).ToArray();
        var (a, b, c) = (firstStops[0].Id, firstStops[1].Id, firstStops[2].Id);
        var run = new RouteTestRun
        {
            Id = Guid.NewGuid(), RouteRevisionId = first.Id, RouteRevision = first, MapVersionId = map.Id, MapPackageSha256 = map.PackageSha256,
            ResultCode = "PASS", AllStopsReached = true, SafelyStopped = true, LocalizationPassed = true, EvidenceNote = "ok",
            CheckedAt = new DateTimeOffset(2026, 11, 26, 3, 0, 0, TimeSpan.Zero), TraversedStopIdsJson = $"[\"{a}\",\"{c}\",\"{b}\"]"
        };
        var unknown = Guid.NewGuid();
        var odd = new RouteTestRun
        {
            Id = Guid.NewGuid(), RouteRevisionId = first.Id, RouteRevision = first, MapVersionId = map.Id, MapPackageSha256 = map.PackageSha256,
            ResultCode = "FAIL", EvidenceNote = "x", CheckedAt = run.CheckedAt.AddMinutes(1), TraversedStopIdsJson = $"[\"{a}\",\"{unknown}\"]"
        };
        var repository = DispatchProxy.Create<IRouteRevisionRepository, Repository>();
        var stub = (Repository)(object)repository;
        stub.Route = route;
        stub.Map = map;
        stub.Revisions = [first, second];
        stub.Stops = new() { [first.Id] = firstStops, [second.Id] = secondStops };
        stub.Runs = [run, odd];

        var view = await new GetRouteRevisionHandler(repository, new TourScheduleSettings(TourShiftsFixture.Options, null))
            .Handle(new GetRouteRevisionQuery(route.Id, second.Id, false), default);

        var carried = Assert.Single(view.TestRuns, item => item.Id == run.Id);
        Assert.Equal([a, c, b], carried.TraversedStopIds!);
        Assert.DoesNotContain(view.Stops, stop => carried.TraversedStopIds!.Contains(stop.Id));
        Assert.Equal([(a, (int?)1, "Thư viện"), (c, 3, "Hội trường"), (b, 2, "Phòng lab")],
            carried.TraversedStops!.Select(step => (step.StopId, step.StopOrder, step.Name)).ToArray());
        Assert.Equal(firstStops[0].PoiProposalRevisionId, carried.TraversedStops![0].PoiRevisionId);
        // An id the run's revision does not have keeps its place with no name.
        Assert.Equal([(a, (string?)"Thư viện"), (unknown, null)],
            Assert.Single(view.TestRuns, item => item.Id == odd.Id).TraversedStops!.Select(step => (step.StopId, step.Name)).ToArray());
    }

    private static RouteRevision Revision(Route route, MapVersion map, int number) => new()
    {
        Id = Guid.NewGuid(), RouteId = route.Id, RevisionNumber = number, Name = route.Name, MapVersionId = map.Id,
        MapPackageSha256 = map.PackageSha256, NavigationFingerprint = [9], EndMode = "RETURN_TO_START", ViewerChoosesNextStop = true,
        CreatedAt = new DateTimeOffset(2026, 11, 20 + number, 0, 0, 0, TimeSpan.Zero)
    };

    private static RouteRevisionStop Stop(RouteRevision revision, int order, string name)
    {
        var stop = new RouteRevisionStop
        {
            Id = Guid.NewGuid(), RouteRevisionId = revision.Id, RouteRevision = revision, PoiProposalRevisionId = Guid.NewGuid(),
            StopOrder = order, DwellSeconds = 30, HeadStepsJson = "[]", Name = name, CameraPreset = "FRONT",
            PoiNavigationFingerprint = [(byte)order], X = order, Y = order, Yaw = 0
        };
        revision.RouteRevisionStops.Add(stop);
        return stop;
    }

    /// <summary>The route, its revisions, stops and runs; every other read is empty.</summary>
    public class Repository : DispatchProxy
    {
        internal Route Route { get; set; } = null!;
        internal MapVersion Map { get; set; } = null!;
        internal IReadOnlyList<RouteRevision> Revisions { get; set; } = [];
        internal Dictionary<Guid, RouteRevisionStop[]> Stops { get; set; } = [];
        internal IReadOnlyList<RouteTestRun> Runs { get; set; } = [];

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => targetMethod!.Name switch
        {
            nameof(IRouteRevisionRepository.FindRouteAsync) => Task.FromResult<Route?>(Route),
            nameof(IRouteRevisionRepository.FindRevisionAsync) => Task.FromResult(Revisions.SingleOrDefault(item => item.Id == (Guid)args![0]!)),
            nameof(IRouteRevisionRepository.GetMapAsync) => Task.FromResult<MapVersion?>(Map),
            nameof(IRouteRevisionRepository.GetStopsAsync) => Task.FromResult<IReadOnlyList<RouteRevisionStop>>(Stops[(Guid)args![0]!]),
            nameof(IRouteRevisionRepository.GetRevisionsAsync) => Task.FromResult(Revisions),
            nameof(IRouteRevisionRepository.GetTestRunsForRouteAsync) => Task.FromResult(Runs),
            _ => Empty(targetMethod.ReturnType)
        };

        private static object? Empty(Type returnType)
        {
            if (!returnType.IsGenericType) return Task.CompletedTask;
            var result = returnType.GetGenericArguments()[0];
            object? value = result.IsGenericType && result.GetGenericTypeDefinition() is var definition &&
                (definition == typeof(IReadOnlyList<>) || definition == typeof(IReadOnlyCollection<>) || definition == typeof(IEnumerable<>))
                ? Array.CreateInstance(result.GetGenericArguments()[0], 0)
                : result.IsValueType ? Activator.CreateInstance(result) : null;
            return typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(result).Invoke(null, [value]);
        }
    }
}
