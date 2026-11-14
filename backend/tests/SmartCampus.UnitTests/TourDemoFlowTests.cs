using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.AutoAdvanceTour;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>Opening a Tour without its first leg, pausing a leg and the automatic departure (demo flow).</summary>
public sealed class TourDemoFlowTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UnixEpoch;

    private static Tour Opened()
    {
        var tour = new Tour { State = "READY" };
        tour.Start(Guid.NewGuid(), Now);
        tour.WaitAtStart(Now);
        return tour;
    }

    [Fact]
    public void AnOpenedTour_WaitsAtTheStart_AndCanDepartButNotPause()
    {
        var tour = Opened();
        Assert.Equal((TourRuntime.Running, TourRuntime.Normal, TourRuntime.Initializing), (tour.State, tour.OperationalStatus, tour.CurrentStep));
        Assert.Null(tour.CurrentLegId);
        Assert.True(tour.CanAdvance);
        Assert.False(tour.IsOnALeg);
    }

    [Fact]
    public void OnlyANormalLeg_CanBePaused_AndAPausedTourNeitherAdvancesNorPausesAgain()
    {
        var tour = Opened();
        tour.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToPoi, Guid.NewGuid(), Now);
        Assert.True(tour.IsOnALeg);
        Assert.False(tour.CanAdvance);

        tour.Pause(Now);
        Assert.Equal((TourRuntime.Paused, (string?)null), (tour.OperationalStatus, tour.AssistanceReason));
        Assert.False(tour.IsOnALeg);
        Assert.False(tour.CanAdvance);

        var returning = Opened();
        returning.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToEnd, null, Now);
        Assert.True(returning.IsOnALeg);
        returning.RequireAssistance(TourRuntime.NavigationFailed, Now);
        Assert.False(returning.IsOnALeg);
    }

    [Fact]
    public void ARestart_KeepsAPausedTourPaused_AndStillInterruptsARunningLeg()
    {
        var paused = Opened();
        paused.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToPoi, Guid.NewGuid(), Now);
        paused.Pause(Now);
        paused.InterruptByRestart(Now);
        Assert.Equal((TourRuntime.Paused, (string?)null), (paused.OperationalStatus, paused.AssistanceReason));

        var moving = Opened();
        moving.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToPoi, Guid.NewGuid(), Now);
        moving.InterruptByRestart(Now);
        Assert.Equal((TourRuntime.NeedsAssistance, TourRuntime.BackendRestarted), (moving.OperationalStatus, moving.AssistanceReason));
    }

    [Fact]
    public void AutoAdvance_IsDueOnlyAtAPoiWhoseDwellEnded_OnANormalTour()
    {
        var tour = Opened();
        Assert.False(AutoAdvanceTourCommandHandler.IsDue(tour, Now.AddHours(1)));
        var stop = Guid.NewGuid();
        tour.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToPoi, stop, Now);
        Assert.False(AutoAdvanceTourCommandHandler.IsDue(tour, Now.AddHours(1)));
        tour.ArriveAtStop(stop, Now.AddSeconds(30), Now);
        Assert.False(AutoAdvanceTourCommandHandler.IsDue(tour, Now.AddSeconds(29)));
        Assert.True(AutoAdvanceTourCommandHandler.IsDue(tour, Now.AddSeconds(30)));
        tour.RequireAssistance(TourRuntime.NavigationFailed, Now);
        Assert.False(AutoAdvanceTourCommandHandler.IsDue(tour, Now.AddSeconds(30)));
    }

    [Fact]
    public void AutoAdvanceStore_IsOffByDefault_ClaimsEachVisitOnce_AndKeepsTheBlockedReasonForThatVisitOnly()
    {
        var store = new InMemoryTourAutoAdvanceStore();
        var tour = Guid.NewGuid();
        Assert.False(store.IsEnabled(tour));
        Assert.Empty(store.EnabledTours());

        store.Set(tour, true);
        Assert.True(store.IsEnabled(tour));
        Assert.Equal([tour], store.EnabledTours());

        var visit = Guid.NewGuid();
        Assert.True(store.TryClaim(visit));
        Assert.False(store.TryClaim(visit));
        Assert.True(store.TryClaim(Guid.NewGuid()));

        store.SetBlocked(tour, visit, "robotLocalized");
        Assert.Equal("robotLocalized", store.BlockedReason(tour, visit));
        Assert.Null(store.BlockedReason(tour, Guid.NewGuid()));
        Assert.Null(store.BlockedReason(tour, null));

        store.Set(tour, false);
        Assert.False(store.IsEnabled(tour));
        Assert.Empty(store.EnabledTours());
    }
}
