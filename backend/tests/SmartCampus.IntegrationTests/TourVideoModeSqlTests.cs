using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.StudentTour;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.SetTourVideoMode;
using SmartCampus.Application.Features.Tours.Commands.UpdateTour;
using FluentValidation;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0075: the Operator's switch between the live picture and the fallback video, on SQL.</summary>
public sealed class TourVideoModeSqlTests
{
    private const string Video = "https://res.cloudinary.com/demo-cloud/video/authenticated/smartcampus/tours/fallback/0123456789abcdef0123456789abcdef.mp4";

    [SchemaV11Fact]
    public async Task OnlyTheOperatorSwitches_WhileRunning_WithAVideo_AndEverySwitchIsInTheHistory()
    {
        await using var w = await World.Create(enabled: true);
        Assert.Equal(TourVideoModes.InvalidCode, (await Refused(w, w.H.OperatorId, TourVideoModes.Fallback)).Code);
        Assert.Null((await Detail(w)).Video);

        await Start(w);
        var token = await Session(w, await w.AddAcceptedViewer("ana"));
        var live = (await Detail(w)).Video!;
        Assert.Equal(new TourVideoModeView(TourVideoModes.Live, null, null, null, false), live);
        Assert.Equal(TourVideoModes.InvalidCode, (await Refused(w, w.H.OperatorId, TourVideoModes.Fallback)).Code);

        await w.H.Database.ExecuteAsync($"UPDATE dbo.Tours SET FallbackVideoUrl = '{Video}' WHERE Id = '{w.H.TourId}';");
        await Assert.ThrowsAsync<ForbiddenException>(() => Switch(w, w.H.StaffId, TourVideoModes.Fallback));
        Assert.Equal(TourVideoModes.InvalidCode, (await Refused(w, w.H.OperatorId, TourVideoModes.Live)).Code);

        await Switch(w, w.H.OperatorId, TourVideoModes.Fallback, "  Kính mất hình  ");
        var fallback = (await Detail(w)).Video!;
        Assert.Equal((TourVideoModes.Fallback, "Kính mất hình", true), (fallback.Mode, fallback.Reason, fallback.HasFallbackVideo));
        Assert.NotNull(fallback.ActorName);
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, token));
        Assert.Equal((TourVideoModes.Fallback, fallback.Since), (view.Progress!.VideoMode, view.Progress.VideoModeSince));
        Assert.Equal(TourVideoModes.InvalidCode, (await Refused(w, w.H.OperatorId, TourVideoModes.Fallback)).Code);

        await Switch(w, w.H.OperatorId, TourVideoModes.Live, "Kính có hình lại");
        Assert.Equal(TourVideoModes.Live, (await Detail(w)).Video!.Mode);
        Assert.Equal(TourVideoModes.Live, (await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, token))).Progress!.VideoMode);

        await using var db = w.H.Context();
        var history = await db.TourEvents.AsNoTracking().Where(e => e.TourId == w.H.TourId &&
                (e.EventType == TourLifecycleEvents.VideoFallbackStarted || e.EventType == TourLifecycleEvents.VideoLiveRestored))
            .OrderBy(e => e.Id).ToListAsync();
        Assert.Equal([TourLifecycleEvents.VideoFallbackStarted, TourLifecycleEvents.VideoLiveRestored], history.Select(e => e.EventType));
        Assert.All(history, e => Assert.Equal(w.H.OperatorId, e.ActorUserId));
        Assert.Equal(["Kính mất hình", "Kính có hình lại"], history.Select(e => e.ReasonNote));
    }

    // ADR-0075 stage 2: Staff set where each POI starts in the fallback video; the marks follow that one video.
    [SchemaV11Fact]
    public async Task FallbackVideoMarks_AreSetWithTheVideo_OnTheRouteStops_AndANewVideoStartsWithout()
    {
        // A Tour still in preparation: no registration or operational use, so Staff may edit it (TOUR_LOCKED otherwise).
        await using var h = await TourReadySqlTests.Harness.Create();
        Guid[] stops;
        Tour tour;
        await using (var db = h.Context())
        {
            stops = await db.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == h.Route.RevisionId)
                .OrderBy(s => s.StopOrder).Select(s => s.Id).ToArrayAsync();
            tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == h.TourId);
        }
        TourInput Input(string? video, IReadOnlyList<FallbackVideoMark>? marks) =>
            new(tour.Name, tour.Description, tour.RouteId, tour.ScheduledStartAt, video, marks);
        async Task Update(TourInput input) =>
            await h.Send(new UpdateTourCommand(h.TourId, h.StaffId, new(Guid.NewGuid(), (await h.Detail()).Tour.RowVersion, null, input)));

        await Update(Input(Video, [new(stops[1], 95), new(stops[0], 4)]));
        Assert.Equal([new FallbackVideoMark(stops[0], 4), new FallbackVideoMark(stops[1], 95)], (await h.Detail()).FallbackVideoMarks);
        // The marks are preparation: the Tour stays editable. Null keeps them; the same marks again write nothing.
        Assert.True((await h.Detail()).Permissions.CanEditMetadata);
        await Update(Input(Video, null));
        await Update(Input(Video, [new(stops[0], 4), new(stops[1], 95)]));
        Assert.Equal(2, (await h.Detail()).FallbackVideoMarks!.Count);
        await using (var db = h.Context())
        {
            var set = await db.TourEvents.AsNoTracking().Where(e => e.TourId == h.TourId && e.EventType == TourLifecycleEvents.FallbackVideoMarksSet).ToListAsync();
            Assert.Equal(h.StaffId, Assert.Single(set).ActorUserId);
        }

        await Assert.ThrowsAsync<ValidationException>(() => Update(Input(Video, [new(Guid.NewGuid(), 10)])));
        await Update(Input(Video.Replace("0123", "4567"), null));
        Assert.Empty((await h.Detail()).FallbackVideoMarks!);
    }

    private static Task<TourDetails> Detail(World w) => w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));

    private static Task<TourMutationResult> Switch(World w, Guid actor, string mode, string reason = "Thử chuyển") =>
        w.H.Send(new SetTourVideoModeCommand(w.H.TourId, actor, mode, reason));

    private static Task<ConflictException> Refused(World w, Guid actor, string mode) =>
        Assert.ThrowsAsync<ConflictException>(() => Switch(w, actor, mode));

    private static async Task<string> Session(World w, Guid invitation)
    {
        var token = Guid.NewGuid().ToString("N");
        await using var db = w.H.Context();
        db.Add(new BrowserSession
        {
            Id = Guid.NewGuid(), InvitationId = invitation, SessionTokenHash = w.H.Service<IInvitationCodeService>().Hash("browser-session:" + token),
            CreatedAt = w.H.Start.AddMinutes(-30), ExpiresAt = w.H.Start.AddHours(1)
        });
        await db.SaveChangesAsync();
        return token;
    }
}
