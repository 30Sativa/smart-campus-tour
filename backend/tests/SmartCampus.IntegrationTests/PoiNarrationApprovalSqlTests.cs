using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using MediatR;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0060 on a real v1.22 database: narration versions of a POI, edited in place as a draft and approved by a Staff
/// other than the last editor. The POI is inserted without any revision check, because narration does not depend on it.
/// </summary>
public sealed class PoiNarrationApprovalSqlTests
{
    [SchemaV11Fact]
    public async Task Draft_IsCreatedOnce_EditedInPlace_AndAStaleVersionIsRefused()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();

        var created = await h.SaveDraft(h.A, poi, null, "  Bản đầu tiên.  ", " https://video.example.test/a ");
        Assert.Equal(1, created.RevisionNumber);
        Assert.Equal(PoiNarrationStates.Draft, created.State);
        Assert.Equal("Bản đầu tiên.", created.NarrationText);
        Assert.Equal("https://video.example.test/a", created.FallbackVideoUrl);
        Assert.Equal(h.A, created.CreatedByUserId);
        Assert.Equal(h.A, created.LastEditedByUserId);
        Assert.Null(created.ApprovedByUserId);

        // A second "create" means the caller did not see the existing draft.
        Assert.Equal("STALE_VERSION", (await Assert.ThrowsAsync<ConflictException>(() => h.SaveDraft(h.B, poi, null, "Bản khác."))).Code);

        var edited = await h.SaveDraft(h.B, poi, created.RowVersion, "Bản đã sửa.");
        Assert.Equal(1, edited.RevisionNumber);
        Assert.Equal("Bản đã sửa.", edited.NarrationText);
        Assert.Null(edited.FallbackVideoUrl);
        Assert.Equal(h.A, edited.CreatedByUserId);
        Assert.Equal(h.B, edited.LastEditedByUserId);
        Assert.Equal(h.UserName, edited.LastEditedByName);
        Assert.NotEqual(created.RowVersion, edited.RowVersion);

        var stale = await Assert.ThrowsAsync<ConflictException>(() => h.SaveDraft(h.A, poi, created.RowVersion, "Ghi đè."));
        Assert.Equal("STALE_VERSION", stale.Code);

        await using var db = h.Context();
        var only = Assert.Single(await db.PoiNarrationRevisions.AsNoTracking().ToArrayAsync());
        Assert.Equal("Bản đã sửa.", only.NarrationText);
        Assert.Equal(["POI_NARRATION_DRAFT_CREATED", "POI_NARRATION_DRAFT_EDITED"],
            await db.AuditLogs.Where(audit => audit.EntityType == "PoiNarrationRevision").OrderBy(audit => audit.OccurredAt)
                .Select(audit => audit.Action).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task OnlyAnotherStaffThanTheLastEditorApproves_AndApprovingSupersedesThePreviousVersion()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();
        var first = await h.SaveDraft(h.A, poi, null, "Phiên bản 1.");

        var self = await Assert.ThrowsAsync<ConflictException>(() => h.Approve(h.A, poi, 1, first.RowVersion));
        Assert.Equal("NARRATION_SELF_APPROVAL_FORBIDDEN", self.Code);
        var wrongVersion = await Assert.ThrowsAsync<ConflictException>(() => h.Approve(h.B, poi, 1, Convert.ToBase64String(new byte[8])));
        Assert.Equal("STALE_VERSION", wrongVersion.Code);

        var approved = await h.Approve(h.B, poi, 1, first.RowVersion);
        Assert.Equal(PoiNarrationStates.Approved, approved.State);
        Assert.Equal(h.B, approved.ApprovedByUserId);
        Assert.Equal(h.UserName, approved.ApprovedByName);
        Assert.NotNull(approved.ApprovedAt);
        var again = await Assert.ThrowsAsync<ConflictException>(() => h.Approve(h.C, poi, 1, approved.RowVersion));
        Assert.Equal("NARRATION_NOT_DRAFT", again.Code);

        // A creates, B edits last, so A may approve.
        var second = await h.SaveDraft(h.A, poi, null, "Phiên bản 2.");
        Assert.Equal(2, second.RevisionNumber);
        second = await h.SaveDraft(h.B, poi, second.RowVersion, "Phiên bản 2, đã sửa.");
        var secondApproved = await h.Approve(h.A, poi, 2, second.RowVersion);
        Assert.Equal(h.A, secondApproved.ApprovedByUserId);

        var versions = await h.Send(new ListPoiNarrationsQuery(poi));
        Assert.Equal([2, 1], versions.Select(version => version.RevisionNumber).ToArray());
        Assert.Equal(PoiNarrationStates.Superseded, versions[1].State);
        Assert.Equal(h.B, versions[1].ApprovedByUserId);
        var discardApproved = await Assert.ThrowsAsync<ConflictException>(() => h.Discard(h.B, poi, 2, secondApproved.RowVersion));
        Assert.Equal("NARRATION_NOT_DRAFT", discardApproved.Code);

        var third = await h.SaveDraft(h.C, poi, null, "Phiên bản 3.");
        var discarded = await h.Discard(h.C, poi, 3, third.RowVersion);
        Assert.Equal(PoiNarrationStates.Discarded, discarded.State);
        Assert.Null(discarded.ApprovedByUserId);
        Assert.Equal("NARRATION_NOT_DRAFT", (await Assert.ThrowsAsync<ConflictException>(() => h.Approve(h.A, poi, 3, discarded.RowVersion))).Code);
        // After a discard a new draft takes the next number.
        Assert.Equal(4, (await h.SaveDraft(h.A, poi, null, "Phiên bản 4.")).RevisionNumber);

        await using var db = h.Context();
        Assert.Equal(1, await db.PoiNarrationRevisions.CountAsync(row => row.State == PoiNarrationStates.Approved));
        Assert.Equal(2, await db.AuditLogs.CountAsync(audit => audit.Action == "POI_NARRATION_APPROVED"));
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "POI_NARRATION_DISCARDED"));
    }

    [SchemaV11Fact]
    public async Task ADiscardedPoi_TakesNoNarrationWrite()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();
        var draft = await h.SaveDraft(h.A, poi, null, "Nội dung.");
        await using (var db = h.Context())
            await db.PoiProposals.Where(proposal => proposal.Id == poi).ExecuteUpdateAsync(setters => setters
                .SetProperty(proposal => proposal.DiscardedAt, DateTimeOffset.UtcNow).SetProperty(proposal => proposal.DiscardedByUserId, h.A));

        Assert.Equal("POI_PROPOSAL_DISCARDED", (await Assert.ThrowsAsync<ConflictException>(() => h.SaveDraft(h.A, poi, draft.RowVersion, "Sửa."))).Code);
        Assert.Equal("POI_PROPOSAL_DISCARDED", (await Assert.ThrowsAsync<ConflictException>(() => h.Approve(h.B, poi, 1, draft.RowVersion))).Code);
        Assert.Equal("POI_PROPOSAL_DISCARDED", (await Assert.ThrowsAsync<ConflictException>(() => h.Discard(h.B, poi, 1, draft.RowVersion))).Code);
        // History stays readable.
        Assert.Single(await h.Send(new ListPoiNarrationsQuery(poi)));
        await Assert.ThrowsAsync<NotFoundException>(() => h.SaveDraft(h.A, Guid.NewGuid(), null, "Không có POI."));
    }

    [SchemaV11Fact]
    public async Task ARepeatedRequestId_ReturnsTheSameResult_AndOtherContentIsAConflict()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();
        var requestId = Guid.NewGuid();
        var first = await h.SaveDraft(h.A, poi, null, "Nội dung.", requestId: requestId);
        var replay = await h.SaveDraft(h.A, poi, null, "Nội dung.", requestId: requestId);
        Assert.Equal(first, replay);
        var conflict = await Assert.ThrowsAsync<ConflictException>(() => h.SaveDraft(h.A, poi, null, "Khác.", requestId: requestId));
        Assert.Equal("IDEMPOTENCY_CONFLICT", conflict.Code);
        // One request id covers every narration operation of that user.
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() => h.Discard(h.A, poi, 1, first.RowVersion, requestId))).Code);

        var approveId = Guid.NewGuid();
        var approved = await h.Approve(h.B, poi, 1, first.RowVersion, approveId);
        Assert.Equal(approved, await h.Approve(h.B, poi, 1, first.RowVersion, approveId));

        await using var db = h.Context();
        Assert.Single(await db.PoiNarrationRevisions.ToArrayAsync());
        Assert.Equal(["APPROVE", "CREATE"], await db.PoiNarrationRequestReceipts.OrderBy(receipt => receipt.Operation)
            .Select(receipt => receipt.Operation).ToArrayAsync());
        Assert.Equal(2, await db.AuditLogs.CountAsync(audit => audit.EntityType == "PoiNarrationRevision"));
    }

    [SchemaV11Fact]
    public async Task TwoSimultaneousApprovals_ExactlyOneSucceeds()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();
        var draft = await h.SaveDraft(h.A, poi, null, "Nội dung.");

        var attempts = await Task.WhenAll(new[] { h.B, h.C }.Select(async approver =>
        {
            try { await h.Approve(approver, poi, 1, draft.RowVersion); return (string?)null; }
            catch (ConflictException error) { return error.Code; }
        }));

        Assert.Single(attempts, code => code is null);
        Assert.Contains(Assert.Single(attempts, code => code is not null), new[] { "STALE_VERSION", "NARRATION_NOT_DRAFT" });
        await using var db = h.Context();
        Assert.Equal(1, await db.PoiNarrationRevisions.CountAsync(row => row.State == PoiNarrationStates.Approved));
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "POI_NARRATION_APPROVED"));
    }

    [SchemaV11Fact]
    public async Task TheDatabaseRefusesSelfApprovalAndASecondDraftOrApprovedRow()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();
        var draft = await h.SaveDraft(h.A, poi, null, "Nội dung.");

        var self = await Assert.ThrowsAsync<SqlException>(() => h.Execute(
            $"UPDATE dbo.PoiNarrationRevisions SET State=N'APPROVED', ApprovedByUserId='{h.A}', ApprovedAt=SYSDATETIMEOFFSET() WHERE Id='{draft.Id}';"));
        Assert.Contains("CK_PoiNarrationRevisions_NotSelfApproved", self.Message);
        var secondDraft = await Assert.ThrowsAsync<SqlException>(() => h.Execute(Insert(poi, 2, "DRAFT", h.A, null)));
        Assert.Contains("UX_PoiNarrationRevisions_Draft", secondDraft.Message);

        await h.Approve(h.B, poi, 1, draft.RowVersion);
        var secondApproved = await Assert.ThrowsAsync<SqlException>(() => h.Execute(Insert(poi, 2, "APPROVED", h.A, h.B)));
        Assert.Contains("UX_PoiNarrationRevisions_Approved", secondApproved.Message);
        var approvedWithoutApprover = await Assert.ThrowsAsync<SqlException>(() => h.Execute(Insert(poi, 2, "SUPERSEDED", h.A, null)));
        Assert.Contains("CK_PoiNarrationRevisions_Approval", approvedWithoutApprover.Message);

        static string Insert(Guid proposalId, int number, string state, Guid editor, Guid? approver) =>
            $"""
            INSERT dbo.PoiNarrationRevisions(Id,ProposalId,RevisionNumber,NarrationText,State,CreatedByUserId,CreatedAt,
                LastEditedByUserId,LastEditedAt,ApprovedByUserId,ApprovedAt)
            VALUES(NEWID(),'{proposalId}',{number},N'x',N'{state}','{editor}',SYSDATETIMEOFFSET(),'{editor}',SYSDATETIMEOFFSET(),
                {(approver is null ? "NULL" : $"'{approver}'")},{(approver is null ? "NULL" : "SYSDATETIMEOFFSET()")});
            """;
    }

    [SchemaV11Fact]
    public async Task OnlyStaffWritesOrApproves_TechnicalStaffMayRead()
    {
        await using var h = await Harness.Create();
        var poi = await h.Poi();
        await using var api = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(h.Database.ConnectionString);
        var staff = await Login(api.Client, "narration.a");
        var technical = await Login(api.Client, "narration.technical");
        var admin = await Login(api.Client, "narration.admin");
        var representative = await Login(api.Client, "narration.representative");
        var draftBody = new { requestId = Guid.NewGuid(), narrationText = "Nội dung." };

        foreach (var token in new[] { technical, admin, representative })
        {
            Assert.Equal(HttpStatusCode.Forbidden, await Status(api.Client, HttpMethod.Put, $"/api/staff/poi-proposals/{poi}/narrations/draft", token, draftBody));
            Assert.Equal(HttpStatusCode.Forbidden, await Status(api.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{poi}/narrations/1/approve", token,
                new { requestId = Guid.NewGuid(), expectedRowVersion = "AAAAAAAAAAA=" }));
            Assert.Equal(HttpStatusCode.Forbidden, await Status(api.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{poi}/narrations/1/discard", token,
                new { requestId = Guid.NewGuid(), expectedRowVersion = "AAAAAAAAAAA=" }));
        }
        Assert.Equal(HttpStatusCode.OK, await Status(api.Client, HttpMethod.Put, $"/api/staff/poi-proposals/{poi}/narrations/draft", staff, draftBody));
        Assert.Equal(HttpStatusCode.OK, await Status(api.Client, HttpMethod.Get, $"/api/staff/poi-proposals/{poi}/narrations", technical, null));
        Assert.Equal(HttpStatusCode.Forbidden, await Status(api.Client, HttpMethod.Get, $"/api/staff/poi-proposals/{poi}/narrations", representative, null));
        Assert.Single(await h.Send(new ListPoiNarrationsQuery(poi)));

        static async Task<string> Login(HttpClient client, string username)
        {
            using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = InitialAdminSeederTests.Password });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return json.RootElement.GetProperty("accessToken").GetString()!;
        }

        static async Task<HttpStatusCode> Status(HttpClient client, HttpMethod method, string path, string token, object? body)
        {
            using var request = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body) };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(request);
            return response.StatusCode;
        }
    }

    private sealed class Harness(InitialAdminSeederTests.EmptySchemaDatabase database, ServiceProvider provider, Guid a, Guid b, Guid c)
        : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public Guid A => a;
        public Guid B => b;
        public Guid C => c;
        /// <summary>InsertUserAsync gives every account this full name.</summary>
        public string UserName => "System Administrator";

        public static async Task<Harness> Create()
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            var a = await database.InsertUserAsync(true, username: "narration.a", roles: ["STAFF"]);
            var b = await database.InsertUserAsync(true, username: "narration.b", roles: ["STAFF"]);
            var c = await database.InsertUserAsync(true, username: "narration.c", roles: ["STAFF"]);
            await database.InsertUserAsync(true, username: "narration.technical", roles: ["TECHNICAL_STAFF"]);
            await database.InsertUserAsync(true, username: "narration.admin", roles: ["ADMIN"]);
            await database.InsertUserAsync(true, username: "narration.representative", roles: ["SCHOOL_REPRESENTATIVE"]);
            var settings = InvitationPrimitiveTests.ConfigurationValues().ToDictionary(pair => pair.Key, pair => (string?)pair.Value);
            settings["ConnectionStrings:DefaultConnection"] = database.ConnectionString;
            settings["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey;
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddApplication();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddInfrastructure(configuration);
            return new Harness(database, services.BuildServiceProvider(), a.Id, b.Id, c.Id);
        }

        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);

        /// <summary>A POI proposal with no revision, submission or technical result: narration needs none of them.</summary>
        public async Task<Guid> Poi()
        {
            await using var db = Context();
            var proposal = new PoiProposal
            {
                Id = Guid.NewGuid(), CreatedByUserId = a, CreateRequestId = Guid.NewGuid(), CreateRequestHash = new byte[32],
                CurrentRevision = 1, CreatedAt = DateTimeOffset.UtcNow
            };
            db.PoiProposals.Add(proposal);
            await db.SaveChangesAsync();
            return proposal.Id;
        }

        public async Task Execute(string sql)
        {
            await using var db = Context();
            await db.Database.ExecuteSqlRawAsync(sql);
        }

        public Task<PoiNarrationRevisionView> SaveDraft(Guid actor, Guid poi, string? expectedRowVersion, string text,
            string? video = null, Guid? requestId = null) =>
            Send(new SavePoiNarrationDraftCommand(actor, poi, new(requestId ?? Guid.NewGuid(), expectedRowVersion, text, video)));

        public Task<PoiNarrationRevisionView> Approve(Guid actor, Guid poi, int number, string rowVersion, Guid? requestId = null) =>
            Send(new ApprovePoiNarrationCommand(actor, poi, number, new(requestId ?? Guid.NewGuid(), rowVersion)));

        public Task<PoiNarrationRevisionView> Discard(Guid actor, Guid poi, int number, string rowVersion, Guid? requestId = null) =>
            Send(new DiscardPoiNarrationCommand(actor, poi, number, new(requestId ?? Guid.NewGuid(), rowVersion)));

        public async Task<TResponse> Send<TResponse>(IRequest<TResponse> request)
        {
            await using var scope = provider.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
        }

        public async ValueTask DisposeAsync()
        {
            await provider.DisposeAsync();
            await database.DisposeAsync();
        }
    }
}
