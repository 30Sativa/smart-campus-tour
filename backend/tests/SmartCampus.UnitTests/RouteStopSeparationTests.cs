using System.Reflection;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>docs/lich-tour-theo-ca.md §2: distances between the start, the stops and a separate end pose.</summary>
public sealed class RouteStopSeparationTests
{
    // Every POI made by Poi() is served back by the stub repository; declared first so it exists for the fields below.
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, RoutePoiRevisionEvidence> Registry = new();
    private static readonly MapVersion Map = new() { Id = Guid.NewGuid(), PackageSha256 = new byte[32] };
    private static readonly RoutePoiRevisionEvidence Library = Poi("Thư viện", 2m, 2m);
    private static readonly RoutePoiRevisionEvidence Lab = Poi("Phòng lab", 4m, 2m);

    [Theory]
    [InlineData(2.5, 2.0)]   // 0.5 m from Thư viện
    [InlineData(2.0, 2.0)]   // on Thư viện itself, as when its pose was picked for the start
    public async Task A_start_closer_than_the_minimum_to_a_stop_is_refused_with_the_stop_name(double x, double y)
    {
        var error = await Save(Draft((decimal)x, (decimal)y, Library, Lab));
        Assert.Equal("ROUTE_STOP_TOO_CLOSE", error?.Code);
        Assert.Contains("Thư viện", error!.Message);
    }

    [Fact]
    public async Task A_start_exactly_the_minimum_away_passes_the_separation_rule() =>
        Assert.Null(await Save(Draft(2m, 1m, Library, Lab)));

    [Fact]
    public async Task The_start_must_be_clear_of_every_stop_not_only_the_first() =>
        Assert.Contains("Phòng lab", (await Save(Draft(4m, 2.5m, Library, Lab)))!.Message);

    [Fact]
    public async Task Consecutive_stops_closer_than_the_minimum_are_refused()
    {
        var error = await Save(Draft(0m, 0m, Library, Poi("Sảnh", 2.6m, 2m)));
        Assert.Equal("ROUTE_STOP_TOO_CLOSE", error?.Code);
        Assert.Contains("Thư viện", error!.Message);
        Assert.Contains("Sảnh", error.Message);
    }

    [Fact]
    public async Task A_separate_end_pose_near_the_last_stop_is_refused()
    {
        var error = await Save(Draft(0m, 0m, Library, Lab) with { EndMode = "POSE", EndX = 4.5m, EndY = 2m, EndYaw = 0m });
        Assert.Equal("ROUTE_STOP_TOO_CLOSE", error?.Code);
        Assert.Contains("Phòng lab", error!.Message);
    }

    [Fact]
    public async Task A_separate_end_pose_far_enough_from_the_last_stop_passes() =>
        Assert.Null(await Save(Draft(0m, 0m, Library, Lab) with { EndMode = "POSE", EndX = 5m, EndY = 2m, EndYaw = 0m }));

    [Fact]
    public async Task Return_to_start_is_always_allowed() =>
        Assert.Null(await Save(Draft(0m, 0m, Library, Lab) with { EndMode = "POSE", EndX = 0m, EndY = 0m, EndYaw = 0m }));

    [Fact]
    public async Task The_minimum_comes_from_configuration() =>
        Assert.Null(await Save(Draft(2.5m, 2m, Library, Lab), new RouteRuleSettings(null, 0.4m)));

    private static RouteRevisionDraftInput Draft(decimal startX, decimal startY, params RoutePoiRevisionEvidence[] stops) =>
        new(Guid.NewGuid(), 0, "Tuyến thử", null, Map.Id, startX, startY, 0m, "LAST_POI", null, null, null,
            stops.Select(s => new RouteRevisionStopInput(s.Revision.Id, 30, [new("FRONT", 30)])).ToArray());

    /// <summary>The ROUTE_STOP_TOO_CLOSE conflict, or null when the handler got past the rule.</summary>
    private static async Task<ConflictException?> Save(RouteRevisionDraftInput draft, RouteRuleSettings? rules = null)
    {
        var handler = new SaveRouteRevisionHandler(RouteRepository(), MapRepository(), new MapPoiSettings(null),
            rules ?? new RouteRuleSettings(null, null), TimeProvider.System);
        try
        {
            await handler.Handle(new SaveRouteRevisionCommand(Guid.NewGuid(), null, draft), default);
        }
        catch (ConflictException error) when (error.Code == "ROUTE_STOP_TOO_CLOSE")
        {
            return error;
        }
        catch (Exception error) when (error is not NotImplementedException and not ConflictException)
        {
            // The stub map has no package, so the step after the rule fails; that proves the rule let it through.
        }
        return null;
    }

    private static RoutePoiRevisionEvidence Poi(string name, decimal x, decimal y)
    {
        var fingerprint = Guid.NewGuid().ToByteArray();
        var revision = new PoiProposalRevision { Id = Guid.NewGuid(), ProposalId = Guid.NewGuid(), MapVersionId = Map.Id, Name = name,
            NarrationText = "Thuyết minh.", X = x, Y = y, NavigationFingerprint = fingerprint };
        var verification = new PoiVerificationRecord { Id = Guid.NewGuid(), MapVersionId = Map.Id, ResultCode = "PASS", NavigationFingerprint = fingerprint };
        var evidence = new RoutePoiRevisionEvidence(revision, verification);
        Registry[revision.Id] = evidence;
        return evidence;
    }

    private static IRouteRevisionRepository RouteRepository() => Proxy<IRouteRevisionRepository>((method, args) => method.Name switch
    {
        nameof(IRouteRevisionRepository.LockRequestAsync) => Task.CompletedTask,
        nameof(IRouteRevisionRepository.FindRequestAsync) => Task.FromResult<RouteRevision?>(null),
        nameof(IRouteRevisionRepository.GetMapAsync) => Task.FromResult<MapVersion?>(Map),
        nameof(IRouteRevisionRepository.GetPoiEvidenceAsync) => Task.FromResult(Evidence((IReadOnlyCollection<Guid>)args[0]!)),
        nameof(IRouteRevisionRepository.GetEffectivePoiVerificationAsync) => Task.FromResult<PoiVerificationRecord?>(
            Known.Single(e => e.Revision.ProposalId == (Guid)args[0]!).Verification),
        _ => throw new NotImplementedException(method.Name)
    });

    private static IEnumerable<RoutePoiRevisionEvidence> Known => Registry.Values;

    private static IReadOnlyList<RoutePoiRevisionEvidence> Evidence(IReadOnlyCollection<Guid> ids) =>
        ids.Select(id => Registry[id]).ToArray();

    private static IMapVersionRepository MapRepository() => Proxy<IMapVersionRepository>((method, _) => method.Name switch
    {
        nameof(IMapVersionRepository.LockMapPreparationStateAsync) => Task.CompletedTask,
        nameof(IMapVersionRepository.ListDeploymentChecksForMapAsync) => Task.FromResult<IReadOnlyList<MapDeploymentCheck>>([new MapDeploymentCheck
        {
            Id = Guid.NewGuid(), MapVersionId = Map.Id, RobotId = Guid.NewGuid(), Robot = new Robot { SourceType = "PHYSICAL" },
            PackageSha256 = new byte[32], LocalizationPassed = true, DisplayPassed = true, CheckedAt = DateTimeOffset.UtcNow
        }]),
        _ => throw new NotImplementedException(method.Name)
    });

    private static T Proxy<T>(Func<MethodInfo, object?[], object?> handler) where T : class
    {
        var proxy = DispatchProxy.Create<T, StubProxy>();
        ((StubProxy)(object)proxy).Handler = handler;
        return proxy;
    }

    public class StubProxy : DispatchProxy
    {
        internal Func<MethodInfo, object?[], object?> Handler { get; set; } = null!;
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
            Handler(targetMethod ?? throw new InvalidOperationException("Missing method metadata."), args ?? []);
    }
}
