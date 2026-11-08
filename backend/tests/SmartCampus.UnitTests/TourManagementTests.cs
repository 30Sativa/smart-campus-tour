using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Commands.ReopenTour;
using SmartCampus.Application.Features.Tours.Commands.UpdateTour;
using SmartCampus.Application.Features.Tours.Queries.GetTours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class TourManagementTests
{
    [Theory]
    [InlineData("SCHEDULED", true, true)]
    [InlineData("READY", false, true)]
    [InlineData("RUNNING", false, false)]
    [InlineData("COMPLETED", false, false)]
    [InlineData("CANCELLED", false, false)]
    [InlineData("UNKNOWN", false, false)]
    public void PreStartPolicy_DoesNotAllowRuntimeOrTerminalMutation(string state, bool edit, bool cancel)
    {
        var route = Guid.NewGuid();
        var tour = new Tour { State = state, RouteId = route, ActiveRouteId = route };
        Assert.Equal(edit, tour.CanEditPreparation);
        Assert.Equal(cancel, tour.CanCancelBeforeStart);
        tour.StartedAt = DateTimeOffset.UtcNow;
        Assert.False(tour.CanEditPreparation);
        Assert.False(tour.CanCancelBeforeStart);
    }

    [Fact]
    public void UnexpectedRobotOrExecutionFields_BlockPreparationChanges()
    {
        var tour = new Tour { State = "SCHEDULED" };
        Assert.True(tour.CanEditPreparation);
        tour.AssignedRobotId = Guid.NewGuid();
        Assert.False(tour.CanCancelBeforeStart);
        tour.AssignedRobotId = null;
        tour.CurrentLegId = Guid.NewGuid();
        Assert.False(tour.CanEditPreparation);
        tour.CurrentLegId = null;
        tour.ActiveRouteId = Guid.NewGuid();
        Assert.False(tour.CanCancelBeforeStart);
    }

    [Fact]
    public void VersionedStopFields_AreExecutionState()
    {
        var route = Guid.NewGuid();
        var tour = new Tour { State = "READY", RouteId = route, ActiveRouteId = route };
        Assert.True(tour.CanReopenBeforeStart);
        tour.CurrentRevisionStopId = Guid.NewGuid();
        Assert.True(tour.HasExecutionState);
        Assert.False(tour.CanReopenBeforeStart);
        tour.CurrentRevisionStopId = null;
        tour.LastArrivedRevisionStopId = Guid.NewGuid();
        Assert.False(tour.CanCancelBeforeStart);
    }

    [Fact]
    public void Commands_RejectMissingPayloadsVersionsAndUnsafeUrls()
    {
        var actor = Guid.NewGuid();
        Assert.False(new CreateTourCommandValidator(TourShiftsFixture.Settings).Validate(new CreateTourCommand(actor, null!)).IsValid);
        Assert.False(new UpdateTourCommandValidator().Validate(new UpdateTourCommand(Guid.NewGuid(), actor, null!)).IsValid);
        Assert.False(new CancelTourCommandValidator().Validate(new CancelTourCommand(Guid.NewGuid(), actor, null!)).IsValid);
        var input = new TourInput("Tour", null, Guid.NewGuid(), DateTimeOffset.FromUnixTimeMilliseconds(2_000_000_000_000), null);
        var validator = new TourInputValidator();
        Assert.True(validator.Validate(input).IsValid);
        Assert.False(validator.Validate(input with { Name = " " }).IsValid);
        Assert.False(validator.Validate(input with { ScheduledStartAt = input.ScheduledStartAt.AddTicks(1) }).IsValid);
        Assert.False(validator.Validate(input with { FallbackVideoUrl = "file:///etc/passwd" }).IsValid);
        Assert.False(validator.Validate(input with { FallbackVideoUrl = "https://user:password@example.test/video" }).IsValid);
        Assert.False(new CancelTourCommandValidator().Validate(new CancelTourCommand(Guid.NewGuid(), actor, new(Guid.NewGuid(), "bad", " "))).IsValid);
    }

    [Theory]
    [InlineData("SCHEDULED", false)]
    [InlineData("READY", true)]
    [InlineData("RUNNING", false)]
    [InlineData("CANCELLED", false)]
    public void Reopen_IsOnlyForReadyBeforeStart(string state, bool reopen)
    {
        var route = Guid.NewGuid();
        var tour = new Tour { State = state, RouteId = route, ActiveRouteId = route };
        Assert.Equal(reopen, tour.CanReopenBeforeStart);
        tour.AssignedRobotId = Guid.NewGuid();
        Assert.False(tour.CanReopenBeforeStart);
    }

    [Fact]
    public void ReadyAndReopen_RejectMissingPayloadsVersionsAndReasons()
    {
        var actor = Guid.NewGuid();
        var version = Convert.ToBase64String(new byte[8]);
        var ready = new MarkTourReadyCommandValidator();
        Assert.True(ready.Validate(new MarkTourReadyCommand(Guid.NewGuid(), actor, new(Guid.NewGuid(), version))).IsValid);
        Assert.False(ready.Validate(new MarkTourReadyCommand(Guid.NewGuid(), actor, null!)).IsValid);
        Assert.False(ready.Validate(new MarkTourReadyCommand(Guid.NewGuid(), actor, new(Guid.Empty, version))).IsValid);
        Assert.False(ready.Validate(new MarkTourReadyCommand(Guid.NewGuid(), actor, new(Guid.NewGuid(), "bad"))).IsValid);
        var reopen = new ReopenTourCommandValidator();
        Assert.True(reopen.Validate(new ReopenTourCommand(Guid.NewGuid(), actor, new(Guid.NewGuid(), version, "Sửa danh sách"))).IsValid);
        Assert.False(reopen.Validate(new ReopenTourCommand(Guid.NewGuid(), actor, null!)).IsValid);
        Assert.False(reopen.Validate(new ReopenTourCommand(Guid.NewGuid(), actor, new(Guid.NewGuid(), version, " "))).IsValid);
        Assert.False(reopen.Validate(new ReopenTourCommand(Guid.NewGuid(), actor, new(Guid.NewGuid(), version, new string('x', 1001)))).IsValid);
        Assert.False(reopen.Validate(new ReopenTourCommand(Guid.Empty, actor, new(Guid.NewGuid(), version, "Sửa"))).IsValid);
    }

    [Fact]
    public void List_RejectsUnknownStatesSortsAndReversedRanges()
    {
        var request = new TourListRequest(null, "scheduledStartAt", 1, 20, "SCHEDULED", null, null);
        var validator = new GetToursQueryValidator();
        Assert.True(validator.Validate(new GetToursQuery(request)).IsValid);
        Assert.False(validator.Validate(new GetToursQuery(request with { State = "Ready" })).IsValid);
        Assert.False(validator.Validate(new GetToursQuery(request with { Sort = "robot" })).IsValid);
        Assert.False(validator.Validate(new GetToursQuery(request with { From = DateTimeOffset.UtcNow.AddDays(1), To = DateTimeOffset.UtcNow })).IsValid);
    }
}
