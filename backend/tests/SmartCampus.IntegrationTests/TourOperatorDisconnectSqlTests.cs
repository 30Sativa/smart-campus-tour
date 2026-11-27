using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.DeliverCancelNotice;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.StartTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

public sealed class TourOperatorDisconnectSqlTests
{
    private static async Task Start(World w) => await w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId,
        new(Guid.NewGuid(), await w.H.Version(), null, HoldAtStart: true)));
    private static async Task End(World w, Guid actor) => await w.H.Send(new EndTourEarlyCommand(w.H.TourId, actor,
        new(Guid.NewGuid(), await w.H.Version(), "Lý do kỹ thuật riêng tư")));

    [SchemaV11Theory]
    [InlineData(299, false)]
    [InlineData(300, true)]
    public async Task Backup_UsesInclusiveFiveMinuteThreshold_AndAuditsActor(int seconds, bool allowed)
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var last = w.Clock.Now!.Value;
        w.Clock.Now = last.AddSeconds(seconds);
        var detail = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.StaffId));
        Assert.Equal(allowed, detail.AllowedActions!.EndEarly.Allowed);
        Assert.Equal(last, detail.OperatorLastSeenAt);
        Assert.Equal(allowed ? last : (DateTimeOffset?)null, detail.OperatorDisconnectedSince);
        if (!allowed)
        {
            var error = await Assert.ThrowsAsync<ConflictException>(() => End(w, w.H.StaffId));
            Assert.Equal("OPERATOR_STILL_CONNECTED", error.Code);
            Assert.Equal(last.AddMinutes(5), DateTimeOffset.Parse(error.FieldErrors!["allowedAt"][0]));
            return;
        }
        await End(w, w.H.StaffId);
        await using var db = w.H.Context();
        var ended = await db.TourEvents.AsNoTracking().SingleAsync(e => e.EventType == TourLifecycleEvents.EndedEarly);
        using var data = JsonDocument.Parse(ended.DataJson!);
        Assert.True(data.RootElement.GetProperty("byBackupStaff").GetBoolean());
        Assert.Equal(w.H.OperatorId, data.RootElement.GetProperty("operatorUserId").GetGuid());
        Assert.Equal(last, data.RootElement.GetProperty("operatorLastSeenAt").GetDateTimeOffset());
        Assert.Equal(w.H.StaffId, ended.ActorUserId);
        var after = await w.H.Detail();
        Assert.Null(after.OperatorLastSeenAt); Assert.Null(after.OperatorDisconnectedSince);
        Assert.Equal(w.H.StaffId, after.EndedEarlyByBackupStaff!.ActorUserId);
        Assert.Equal(w.H.OperatorId, after.EndedEarlyByBackupStaff.OperatorUserId);
    }

    [SchemaV11Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LegacyMissingOrNullContact_AllowsBackup(bool rowExists)
    {
        await using var w = await World.Create(enabled: true); await Start(w);
        await w.H.Database.ExecuteAsync(rowExists ? "UPDATE dbo.TourOperatorPresence SET LastSeenAt = NULL;" : "DELETE dbo.TourOperatorPresence;");
        await End(w, w.H.StaffId);
        Assert.Equal("CANCELLED", (await w.H.Detail()).Tour.State);
    }

    [SchemaV11Fact]
    public async Task OperatorContact_IsThrottled_Durable_AndNeverChangesTheTourVersion_OrAllowsOtherViewersToRefreshIt()
    {
        await using var w = await World.Create(enabled: true); await Start(w);
        var last = w.Clock.Now!.Value; var version = await w.H.Version();
        w.Clock.Now = last.AddSeconds(9);
        Assert.Equal(last, (await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId))).OperatorLastSeenAt);
        w.Clock.Now = last.AddSeconds(10);
        Assert.Equal(w.Clock.Now, (await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId))).OperatorLastSeenAt);
        Assert.Equal(version, await w.H.Version());
        w.Clock.Now = last.AddMinutes(6);
        Assert.Equal(last.AddSeconds(10), (await w.H.Send(new GetTourQuery(w.H.TourId, w.H.StaffId))).OperatorLastSeenAt);
        // Every Send has a new scoped DbContext: contact survives disposal/restart of scoped API state.
        Assert.NotNull((await w.H.Send(new GetTourQuery(w.H.TourId, w.H.StaffId))).OperatorDisconnectedSince);
        await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.Equal("OPERATOR_STILL_CONNECTED", (await Assert.ThrowsAsync<ConflictException>(() => End(w, w.H.StaffId))).Code);
        Assert.Equal(version, await w.H.Version());
        await End(w, w.H.OperatorId);
    }

    [SchemaV11Fact]
    public async Task Admin_CannotEndEvenAfterAnHour()
    {
        await using var w = await World.Create(enabled: true); await Start(w);
        var admin = await w.H.Database.InsertUserAsync(true, username: "admin.disconnect", roles: ["ADMIN"]);
        w.Clock.Now = w.Clock.Now!.Value.AddHours(1);
        var error = await Assert.ThrowsAsync<ForbiddenException>(() => End(w, admin.Id));
        Assert.Equal("Chỉ nhân viên vận hành được kết thúc sớm Tour.", error.Message);
    }

    [SchemaV11Fact]
    public async Task EndEarly_QueuesExactlyTheAcceptedGroups_ReplayDoesNotRequeue_AndClaimUsesGenericTemplate()
    {
        await using var w = await World.Create(enabled: true); await Start(w);
        await w.AddAcceptedViewer("second");
        var request = new EndTourEarlyRequest(Guid.NewGuid(), await w.H.Version(), "Lý do kỹ thuật riêng tư");
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, request));
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, request));
        await using var db = w.H.Context();
        var audit = await db.AuditLogs.SingleAsync(a => a.Action == TourCancelNoticeAudit.Requested && a.TourId == w.H.TourId);
        var expected = await db.GroupRegistrations.Where(r => r.TourId == w.H.TourId).OrderBy(r => r.Id).Select(r => r.Id).ToArrayAsync();
        Assert.Equal(2, expected.Length);
        Assert.Equal(expected, TourCancelNoticeAudit.RegistrationIds(audit));
        var emails = await w.H.Send(new ClaimTourCancelNoticeCommand(audit.CorrelationId!.Value, false));
        // Both groups deliberately share the representative address: worker keeps its existing address deduplication.
        var email = Assert.Single(emails); Assert.True(email.EndedEarly); Assert.Empty(email.Reason);
        Assert.Empty(await w.H.Send(new ClaimTourCancelNoticeCommand(audit.CorrelationId.Value, false)));
        Assert.All(await db.Invitations.Where(i => i.RosterRow.Registration.TourId == w.H.TourId).ToArrayAsync(), i => Assert.Null(i.RevokedAt));
        Assert.All(await db.BrowserSessions.Where(s => s.Invitation.RosterRow.Registration.TourId == w.H.TourId).ToArrayAsync(), s => Assert.Null(s.EndedAt));
    }

    [SchemaV11Fact]
    public async Task EmailDisabled_RecordsFailure_WithoutUndoingEndEarly()
    {
        await using var w = await World.Create(enabled: true,
            configure: services => services.AddSingleton(new InvitationSettings(false, 24)));
        await Start(w); await End(w, w.H.OperatorId);
        await using var db = w.H.Context();
        Assert.Equal("CANCELLED", (await w.H.Detail()).Tour.State);
        var audit = await db.AuditLogs.SingleAsync(a => a.TourId == w.H.TourId && a.Action == TourCancelNoticeAudit.Failed);
        Assert.Equal("FAILED", audit.ResultCode);
        Assert.Contains("EMAIL_DISABLED", audit.DataJson);
        Assert.False(await db.AuditLogs.AnyAsync(a => a.TourId == w.H.TourId && a.Action == TourCancelNoticeAudit.Requested));
    }

    [SchemaV11Fact]
    public async Task BackupWaitingForTheTourLock_SeesTheOperatorsCommittedReconnect()
    {
        await using var w = await World.Create(enabled: true); await Start(w);
        var version = await w.H.Version();
        w.Clock.Now = w.Clock.Now!.Value.AddMinutes(6);
        await using var reconnect = w.H.Context();
        await using var transaction = await reconnect.Database.BeginTransactionAsync();
        await reconnect.Database.ExecuteSqlInterpolatedAsync($"SELECT Id FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id = {w.H.TourId}");
        await reconnect.Database.ExecuteSqlInterpolatedAsync($"UPDATE dbo.TourOperatorPresence SET LastSeenAt = {w.Clock.Now.Value} WHERE TourId = {w.H.TourId}");
        var ending = w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.StaffId, new(Guid.NewGuid(), version, "Kiểm tra reconnect")));
        await transaction.CommitAsync();
        Assert.Equal("OPERATOR_STILL_CONNECTED", (await Assert.ThrowsAsync<ConflictException>(() => ending)).Code);
    }

    [SchemaV11Fact]
    public async Task PresencePatch_IsAdditiveAndRerunnable()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync("snapshot-v1.25.sql");
        await database.ExecuteAsync("EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.25';");
        await database.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", "upgrade-v1.25-to-v1.26-operator-presence.sql")));
        await database.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", "upgrade-v1.25-to-v1.26-operator-presence.sql")));
        await using var db = new SmartCampus.Infrastructure.Persistence.ApplicationDbContext(
            new DbContextOptionsBuilder<SmartCampus.Infrastructure.Persistence.ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);
        Assert.Empty(await db.TourOperatorPresences.ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task EndEarly_WithNoAcceptedGroup_DoesNotQueue()
    {
        await using var w = await World.Create(enabled: true); await Start(w);
        await w.H.Database.ExecuteAsync($"UPDATE row SET ParticipationState = 'REJECTED' FROM dbo.RosterRows row JOIN dbo.GroupRegistrations r ON row.RegistrationId=r.Id WHERE r.TourId='{w.H.TourId}';");
        await End(w, w.H.OperatorId);
        await using var db = w.H.Context();
        Assert.False(await db.AuditLogs.AnyAsync(a => a.TourId == w.H.TourId && a.Action == TourCancelNoticeAudit.Requested));
    }
}
