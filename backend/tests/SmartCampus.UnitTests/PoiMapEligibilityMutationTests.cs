using System.Reflection;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class PoiMapEligibilityMutationTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid MapId = Guid.NewGuid();
    private static readonly Guid ProposalId = Guid.NewGuid();
    private static readonly byte[] RowVersion = [1, 2, 3, 4, 5, 6, 7, 8];
    private static readonly MapVersion Map = new() { Id = MapId, PackageSha256 = new byte[32] };
    private static readonly PoiProposal Proposal = new() { Id = ProposalId, CurrentRevision = 1, RowVersion = RowVersion };
    private static readonly PoiProposalRevision Revision = new()
    {
        Id = Guid.NewGuid(), ProposalId = ProposalId, RevisionNumber = 1, MapVersionId = MapId,
        MapVersion = Map, NavigationFingerprint = new byte[32], NarrationText = "Nội dung giới thiệu"
    };

    [Fact]
    public async Task Create_is_rejected_before_any_proposal_or_audit_write_when_map_is_pending()
    {
        var writes = 0;
        var handler = new CreatePoiProposalCommandHandler(
            MapRepository(), ProposalRepository(method => method.Name switch
            {
                nameof(IPoiProposalRepository.FindProposalCreateRequestAsync) => Task.FromResult<PoiProposal?>(null),
                nameof(IPoiProposalRepository.Add) => CountWrite(ref writes),
                nameof(IPoiProposalRepository.AddAuditLog) => CountWrite(ref writes),
                _ => throw new NotImplementedException(method.Name)
            }),
            VerificationRepository(), RequestLock(), DatabaseContext(), new MapPoiSettings(null), TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new CreatePoiProposalCommand(ActorId, new CreatePoiProposalRequest(Guid.NewGuid(), Draft())), default));

        Assert.Equal("TECHNICAL_CHECK_PENDING", error.Code);
        Assert.Equal(0, writes);
    }

    [Fact]
    public async Task Revision_is_rejected_before_revision_or_audit_write_when_new_map_is_not_ready()
    {
        var writes = 0;
        var handler = new CreatePoiRevisionCommandHandler(
            MapRepository(), ProposalRepository(method => method.Name switch
            {
                nameof(IPoiProposalRepository.FindRevisionRequestAsync) => Task.FromResult<PoiProposalRevision?>(null),
                nameof(IPoiProposalRepository.LockProposalAsync) => Task.FromResult<PoiProposal?>(Proposal),
                nameof(IPoiProposalRepository.FindCurrentRevisionAsync) => Task.FromResult<PoiProposalRevision?>(Revision),
                nameof(IPoiProposalRepository.FindSubmissionAsync) => Task.FromResult<PoiProposalSubmission?>(null),
                nameof(IPoiProposalRepository.Add) => CountWrite(ref writes),
                nameof(IPoiProposalRepository.AddAuditLog) => CountWrite(ref writes),
                _ => throw new NotImplementedException(method.Name)
            }),
            VerificationRepository(), RequestLock(), DatabaseContext(), new MapPoiSettings(null), TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new CreatePoiRevisionCommand(ActorId, ProposalId,
                new CreatePoiRevisionRequest(Guid.NewGuid(), 1, Convert.ToBase64String(RowVersion), Draft())), default));

        Assert.Equal("TECHNICAL_CHECK_PENDING", error.Code);
        Assert.Equal(0, writes);
    }

    [Fact]
    public async Task Submitted_revision_without_current_pass_returns_vietnamese_conflict_message()
    {
        var handler = new CreatePoiRevisionCommandHandler(
            MapRepository(), ProposalRepository(method => method.Name switch
            {
                nameof(IPoiProposalRepository.FindRevisionRequestAsync) => Task.FromResult<PoiProposalRevision?>(null),
                nameof(IPoiProposalRepository.LockProposalAsync) => Task.FromResult<PoiProposal?>(Proposal),
                nameof(IPoiProposalRepository.FindCurrentRevisionAsync) => Task.FromResult<PoiProposalRevision?>(Revision),
                nameof(IPoiProposalRepository.FindSubmissionAsync) => Task.FromResult<PoiProposalSubmission?>(new PoiProposalSubmission()),
                _ => throw new NotImplementedException(method.Name)
            }),
            VerificationRepository(method => method.Name switch
            {
                nameof(IPoiVerificationRepository.FindVerificationAsync) => Task.FromResult<PoiVerificationRecord?>(null),
                nameof(IPoiVerificationRepository.FindLatestVerificationByFingerprintAsync) => Task.FromResult<PoiVerificationRecord?>(null),
                _ => throw new NotImplementedException(method.Name)
            }), RequestLock(), DatabaseContext(), new MapPoiSettings(null), TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new CreatePoiRevisionCommand(ActorId, ProposalId,
                new CreatePoiRevisionRequest(Guid.NewGuid(), 1, Convert.ToBase64String(RowVersion), Draft())), default));

        Assert.Equal("POI đã gửi chỉ được chỉnh sửa khi có kết quả kiểm chứng PASS còn hiệu lực cho đúng cấu hình điều hướng hiện tại.", error.Message);
    }

    [Fact]
    public async Task Submit_is_rejected_before_receipt_or_audit_write_when_map_loses_eligibility()
    {
        var writes = 0;
        var handler = new SubmitPoiProposalCommandHandler(
            MapRepository(), ProposalRepository(method => method.Name switch
            {
                nameof(IPoiProposalRepository.FindSubmissionRequestAsync) => Task.FromResult<PoiProposalSubmission?>(null),
                nameof(IPoiProposalRepository.LockProposalAsync) => Task.FromResult<PoiProposal?>(Proposal),
                nameof(IPoiProposalRepository.FindCurrentRevisionAsync) => Task.FromResult<PoiProposalRevision?>(Revision),
                nameof(IPoiProposalRepository.FindSubmissionAsync) => Task.FromResult<PoiProposalSubmission?>(null),
                nameof(IPoiProposalRepository.Add) => CountWrite(ref writes),
                nameof(IPoiProposalRepository.AddAuditLog) => CountWrite(ref writes),
                _ => throw new NotImplementedException(method.Name)
            }),
            VerificationRepository(), RequestLock(), DatabaseContext(), TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new SubmitPoiProposalCommand(ActorId, ProposalId,
                new SubmitPoiProposalRequest(Guid.NewGuid(), 1, Convert.ToBase64String(RowVersion))), default));

        Assert.Equal("TECHNICAL_CHECK_PENDING", error.Code);
        Assert.Equal(0, writes);
    }

    private static PoiProposalDraft Draft() => new(MapId, "North entrance", "Entrance", null, 1m, 2m, 0m, "FRONT", "Nội dung giới thiệu", null);

    private static IMapVersionRepository MapRepository() => Proxy<IMapVersionRepository>(method => method.Name switch
    {
        nameof(IMapVersionRepository.FindMapVersionAsync) => Task.FromResult<MapVersion?>(Map),
        nameof(IMapVersionRepository.ListDeploymentChecksForMapAsync) => Task.FromResult<IReadOnlyList<MapDeploymentCheck>>([]),
        nameof(IMapVersionRepository.LockMapPreparationStateAsync) => Task.CompletedTask,
        _ => throw new NotImplementedException(method.Name)
    });

    private static IPoiProposalRepository ProposalRepository(Func<MethodInfo, object?> handler) => Proxy<IPoiProposalRepository>(handler);

    private static IPoiVerificationRepository VerificationRepository(Func<MethodInfo, object?>? handler = null) => Proxy<IPoiVerificationRepository>(handler ?? (method => method.Name switch
    {
        nameof(IPoiVerificationRepository.FindVerificationAsync) => Task.FromResult<PoiVerificationRecord?>(null),
        _ => throw new NotImplementedException(method.Name)
    }));

    private static IMapPoiRequestLock RequestLock() => Proxy<IMapPoiRequestLock>(_ => Task.CompletedTask);
    private static IApplicationDbContext DatabaseContext() => Proxy<IApplicationDbContext>(_ => Task.FromResult(0));

    private static object? CountWrite(ref int writes)
    {
        writes++;
        return null;
    }

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
