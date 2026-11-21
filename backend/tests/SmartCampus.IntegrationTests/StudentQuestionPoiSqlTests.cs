using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Features.StudentQuestions;
using SmartCampus.Application.Features.Tours.Commands.NextTourStop;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence.Repositories;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// The POI snapshot a private question carries (docs/architecture.md §7.1) on a Tour run on a route revision
/// (ADR-0043 D9): the stop the robot stands at, from the RouteRevisionStop snapshot, and none while it drives.
/// </summary>
public sealed class StudentQuestionPoiSqlTests
{
    [SchemaV11Fact]
    public async Task AQuestion_CarriesThePoiTheRobotStandsAt_AndNoneWhileItDrives()
    {
        await using var w = await World.Create(enabled: true);
        var token = await JoinWithToken(w);
        Guid[] stopIds;
        await using (var db = w.H.Context())
            stopIds = await db.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == w.H.Route.RevisionId)
                .OrderBy(s => s.StopOrder).Select(s => s.Id).ToArrayAsync();

        await TourHappyPathSqlTests.Start(w);
        var (answer, sent) = await Ask(w, token);
        Assert.Null(answer.Poi);
        Assert.Null(sent);

        await TourHappyPathSqlTests.Result(w, await TourHappyPathSqlTests.Delivered(w), "TERMINAL", "ARRIVED");
        await AssertAt(w, token, stopIds[0]);

        await w.Report();
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));
        (answer, sent) = await Ask(w, token);
        Assert.Null(answer.Poi);
        Assert.Null(sent);

        await TourHappyPathSqlTests.Result(w, await TourHappyPathSqlTests.Delivered(w), "TERMINAL", "ARRIVED");
        await AssertAt(w, token, stopIds[1]);
    }

    private static async Task AssertAt(World w, string token, Guid revisionStopId)
    {
        RouteRevisionStop stop;
        string? description;
        await using (var db = w.H.Context())
        {
            stop = await db.RouteRevisionStops.AsNoTracking().SingleAsync(s => s.Id == revisionStopId);
            description = await db.PoiProposalRevisions.AsNoTracking().Where(p => p.Id == stop.PoiProposalRevisionId)
                .Select(p => p.Description).SingleAsync();
        }
        Assert.NotNull(stop.NarrationText);

        var (answer, sent) = await Ask(w, token);

        Assert.Equal(new AssistantPoi(stop.PoiProposalRevisionId, stop.Name, description, stop.NarrationText), sent);
        Assert.Equal(new StudentAnswerPoi(stop.PoiProposalRevisionId, stop.Name), answer.Poi);
    }

    /// <summary>A viewing row with an open browser session whose token is known, as after a real join.</summary>
    private static async Task<string> JoinWithToken(World w)
    {
        var invitation = await w.AddAcceptedViewer("asker");
        var token = Guid.NewGuid().ToString("N");
        await using var db = w.H.Context();
        db.Add(new BrowserSession { Id = Guid.NewGuid(), InvitationId = invitation,
            SessionTokenHash = w.H.Service<IInvitationCodeService>().Hash("browser-session:" + token),
            CreatedAt = w.H.Start.AddMinutes(-30), ExpiresAt = w.H.Start.AddHours(1) });
        await db.SaveChangesAsync();
        return token;
    }

    /// <summary>The real handler and SQL readers; only the assistant is replaced, to see the POI it was sent.</summary>
    private static async Task<(StudentAnswer Answer, AssistantPoi? Sent)> Ask(World w, string token)
    {
        await using var db = w.H.Context();
        var assistant = new RecordingAssistant();
        var handler = new AskStudentQuestionCommandHandler(new EfStudentAccessRepository(db), w.H.Service<IInvitationCodeService>(),
            w.H.Service<InvitationSettings>(), assistant, new StudentQuestionGate(w.Clock), w.Clock, new EfStudentTourViewReader(db));
        var answer = await handler.Handle(new AskStudentQuestionCommand(w.H.TourId, token, Guid.NewGuid(), "Đây là đâu?", []),
            CancellationToken.None);
        return (answer, Assert.Single(assistant.Questions).Poi);
    }

    private sealed class RecordingAssistant : IAiAssistantClient
    {
        public List<AssistantQuestion> Questions { get; } = [];

        public Task<AssistantAnswer> AnswerAsync(AssistantQuestion question, CancellationToken ct)
        {
            Questions.Add(question);
            return Task.FromResult(new AssistantAnswer("Trả lời.", false));
        }
    }
}
