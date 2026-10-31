using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Api.Invitations;
using SmartCampus.Application;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class TourCancelNoticeSqlTests
{
    private const string Reason = "Robot cần bảo trì";

    [SchemaV11Fact]
    public async Task Cancel_QueuesInItsCommit_EmailsOnlyAfter_ToSubmittedAndApprovedRepresentatives_AndReplaySendsNothing()
    {
        await using var h = await Harness.Create();
        var cancel = await h.Request();

        await h.Cancel(cancel);
        Assert.Empty(h.Sender.Sent);
        Assert.Equal(1, await h.Count(TourCancelNoticeAudit.Requested));

        await h.Dispatch();
        Assert.Equal(["approved@example.test", "submitted@example.test"], h.Sender.Sent.Select(email => email.Recipient).Order());
        Assert.All(h.Sender.Sent, email =>
        {
            Assert.Equal("Tour thông báo", email.TourName);
            Assert.Equal(Reason, email.Reason);
            Assert.Equal(h.Start, email.ScheduledStartAt);
        });
        var sent = Assert.Single(await h.Notices(TourCancelNoticeAudit.Sent));
        using (var data = JsonDocument.Parse(sent.DataJson!))
            Assert.Equal(2, Assert.Single(data.RootElement.EnumerateObject(), p => p.Name == "recipientCount").Value.GetInt32());

        await h.Cancel(cancel);
        await h.Dispatch();
        Assert.Equal(2, h.Sender.Sent.Count);
        Assert.Equal(1, await h.Count(TourCancelNoticeAudit.Requested));
        Assert.Equal(1, await h.Count(TourCancelNoticeAudit.Sent));
        await h.AssertNoticeAuditsHoldNoAddressOrBody();
    }

    [SchemaV11Fact]
    public async Task OneRepresentativeWithTwoGroupsUnderOneAddress_GetsOneEmail()
    {
        await using var h = await Harness.Create();
        await h.AddRegistration("APPROVED", "SUBMITTED@example.test");
        await h.Cancel(await h.Request());
        await h.Dispatch();
        Assert.Equal(2, h.Sender.Sent.Count);
    }

    [SchemaV11Fact]
    public async Task EmailFailures_KeepTheCancel_WriteOneFailureAuditPerRecipient_AndAreNotRetried()
    {
        await using var h = await Harness.Create();
        h.Sender.Refuse("submitted@example.test");
        h.Sender.Throw("approved@example.test");
        await h.Cancel(await h.Request());
        await h.Dispatch();
        await h.Dispatch();

        await using var db = h.Context();
        Assert.Equal("CANCELLED", (await db.Tours.SingleAsync()).State);
        Assert.Equal(2, h.Sender.Attempts);
        var failures = await h.Notices(TourCancelNoticeAudit.Failed);
        Assert.Equal(2, failures.Length);
        Assert.All(failures, failure => Assert.Equal("GroupRegistration", failure.EntityType));
        Assert.Equal(["FAILED", "UNKNOWN"], failures.Select(failure => failure.ResultCode).Order());
        Assert.Equal(0, await h.Count(TourCancelNoticeAudit.Sent));
        await h.AssertNoticeAuditsHoldNoAddressOrBody();
    }

    [SchemaV11Fact]
    public async Task PartialFailure_RecordsBothOutcomes()
    {
        await using var h = await Harness.Create();
        h.Sender.Refuse("submitted@example.test");
        await h.Cancel(await h.Request());
        await h.Dispatch();
        Assert.Equal(1, await h.Count(TourCancelNoticeAudit.Failed));
        var sent = Assert.Single(await h.Notices(TourCancelNoticeAudit.Sent));
        Assert.Contains("\"recipientCount\":1", sent.DataJson);
    }

    [SchemaV11Fact]
    public async Task RolledBackCancel_QueuesNothing()
    {
        await using var h = await Harness.Create();
        await h.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestCancelNotice CHECK (Action <> 'TOUR_CANCEL_NOTICE_REQUESTED');");
        var request = await h.Request();
        await Assert.ThrowsAnyAsync<Exception>(() => h.Cancel(request));
        await h.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestCancelNotice;");
        await h.Dispatch();
        await using var db = h.Context();
        Assert.Equal("SCHEDULED", (await db.Tours.SingleAsync()).State);
        Assert.Empty(h.Sender.Sent);
    }

    [SchemaV11Fact]
    public async Task ClaimInterruptedByARestart_IsReportedAndNeverSentAgain()
    {
        await using var h = await Harness.Create();
        await h.Cancel(await h.Request());
        await using (var db = h.Context())
        {
            var request = await db.AuditLogs.SingleAsync(a => a.Action == TourCancelNoticeAudit.Requested);
            db.AuditLogs.Add(TourCancelNoticeAudit.Create(request.TourId!.Value, request.ActorUserId, TourCancelNoticeAudit.Started,
                request.CorrelationId!.Value, DateTimeOffset.UtcNow.AddMinutes(-5), "PENDING"));
            await db.SaveChangesAsync();
        }
        await h.Dispatch();
        await h.Dispatch();
        Assert.Equal(0, h.Sender.Attempts);
        var failure = Assert.Single(await h.Notices(TourCancelNoticeAudit.Failed));
        Assert.Equal("UNKNOWN", failure.ResultCode);
        Assert.Contains("INTERRUPTED", failure.DataJson);
    }

    [SchemaV11Fact]
    public async Task EmailDisabled_RecordsThatNoNoticeWentOut()
    {
        await using var h = await Harness.Create(emailEnabled: false);
        await h.Cancel(await h.Request());
        await using var db = h.Context();
        Assert.Equal("CANCELLED", (await db.Tours.SingleAsync()).State);
        Assert.Equal(0, await h.Count(TourCancelNoticeAudit.Requested));
        var failure = Assert.Single(await h.Notices(TourCancelNoticeAudit.Failed));
        Assert.Contains("EMAIL_DISABLED", failure.DataJson);
        Assert.Contains("\"recipientCount\":2", failure.DataJson);
    }

    private sealed class FakeSender : IInvitationEmailSender
    {
        private readonly HashSet<string> refused = [];
        private readonly HashSet<string> throwing = [];
        public List<TourCancelEmail> Sent { get; } = [];
        public int Attempts { get; private set; }
        public void Refuse(string recipient) => refused.Add(recipient);
        public void Throw(string recipient) => throwing.Add(recipient);
        public Task<EmailSendResult> SendAsync(InvitationEmail email, CancellationToken ct) => throw new InvalidOperationException("Not an invitation.");
        public Task<EmailSendResult> SendTourCancelledAsync(TourCancelEmail email, CancellationToken ct)
        {
            Attempts++;
            if (throwing.Contains(email.Recipient)) throw new HttpRequestException("provider echoed " + email.Recipient);
            if (refused.Contains(email.Recipient)) return Task.FromResult(new EmailSendResult("FAILED", "PROVIDER_REJECTED"));
            Sent.Add(email);
            return Task.FromResult(new EmailSendResult("ACCEPTED", "RESEND_ACCEPTED"));
        }
    }

    private sealed class Harness(InitialAdminSeederTests.EmptySchemaDatabase database, ServiceProvider provider, FakeSender sender, Guid tourId, Guid staffId, Guid representativeId, DateTimeOffset start) : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public FakeSender Sender => sender;
        public DateTimeOffset Start => start;
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);

        public static async Task<Harness> Create(bool emailEnabled = true)
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            var staff = await database.InsertUserAsync(true, username: "notice.staff", roles: ["STAFF"]);
            var representative = await database.InsertUserAsync(true, username: "notice.rep", roles: ["SCHOOL_REPRESENTATIVE"]);
            var settings = InvitationPrimitiveTests.ConfigurationValues().ToDictionary(p => p.Key, p => (string?)p.Value);
            settings["Invitations:Enabled"] = emailEnabled ? "true" : "false";
            settings["ConnectionStrings:DefaultConnection"] = database.ConnectionString;
            settings["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey;
            settings["Tours:StartSlots:0"] = "09:00";
            settings["Tours:CustomStartEarliest"] = "08:00";
            settings["Tours:CustomStartLatest"] = "17:00";
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var sender = new FakeSender();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddApplication();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddInfrastructure(configuration);
            services.AddSingleton<IInvitationEmailSender>(sender);
            services.AddSingleton<TourCancelNoticeDispatcher>();
            var now = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            var tourId = Guid.NewGuid();
            var harness = new Harness(database, services.BuildServiceProvider(), sender, tourId, staff.Id, representative.Id, now.AddDays(10));
            await using var db = harness.Context();
            var routeId = Guid.NewGuid();
            db.Routes.Add(new Route { Id = routeId, Name = "Notice route", MapKey = "map", MapFrame = "map", StartX = 0, StartY = 0, StartYaw = 0,
                EndMode = "LAST_POI", IsActive = true, AuthoringMode = "LEGACY", CreatedAt = now });
            db.Tours.Add(new Tour { Id = tourId, Name = "Tour thông báo", RouteId = routeId, ActiveRouteId = routeId, ScheduledStartAt = now.AddDays(10),
                State = "SCHEDULED", CreatedByUserId = staff.Id, CreatedAt = now });
            await db.SaveChangesAsync();
            await harness.AddRegistration("SUBMITTED", "submitted@example.test");
            await harness.AddRegistration("APPROVED", "approved@example.test");
            await harness.AddRegistration("REJECTED", "rejected@example.test");
            await harness.AddRegistration("CANCELLED", "cancelled@example.test");
            return harness;
        }

        public async Task AddRegistration(string state, string email)
        {
            await using var db = Context();
            var now = DateTimeOffset.UtcNow;
            db.GroupRegistrations.Add(new GroupRegistration { Id = Guid.NewGuid(), TourId = tourId, RepresentativeUserId = representativeId, SchoolName = "THPT Thử",
                GroupName = email, ContactName = "Liên hệ", ContactEmail = email, State = state, SubmittedAt = now, CreatedAt = now });
            await db.SaveChangesAsync();
        }

        public async Task<CancelTourRequest> Request()
        {
            await using var db = Context();
            var tour = await db.Tours.AsNoTracking().SingleAsync();
            return new(Guid.NewGuid(), Convert.ToBase64String(tour.RowVersion), Reason);
        }

        public async Task Cancel(CancelTourRequest request)
        {
            await using var scope = provider.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ISender>().Send(new CancelTourCommand(tourId, staffId, request));
        }

        public Task Dispatch() => provider.GetRequiredService<TourCancelNoticeDispatcher>().DispatchPendingAsync(CancellationToken.None);

        public async Task<int> Count(string action)
        {
            await using var db = Context();
            return await db.AuditLogs.CountAsync(a => a.Action == action);
        }

        public async Task<AuditLog[]> Notices(string action)
        {
            await using var db = Context();
            return await db.AuditLogs.AsNoTracking().Where(a => a.Action == action).ToArrayAsync();
        }

        public async Task AssertNoticeAuditsHoldNoAddressOrBody()
        {
            await using var db = Context();
            var rows = await db.AuditLogs.AsNoTracking().Where(a => a.Action.StartsWith("TOUR_CANCEL_NOTICE_")).ToArrayAsync();
            Assert.NotEmpty(rows);
            Assert.All(rows, row =>
            {
                Assert.DoesNotContain("@", row.DataJson ?? "");
                Assert.DoesNotContain(Reason, row.DataJson ?? "");
            });
        }

        public async ValueTask DisposeAsync()
        {
            await provider.DisposeAsync();
            await database.DisposeAsync();
        }
    }
}
