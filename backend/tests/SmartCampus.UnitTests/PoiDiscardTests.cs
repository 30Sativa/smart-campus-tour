using System.Reflection;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0051: Staff discard a never-passed POI proposal without deleting any row.</summary>
public sealed class PoiDiscardTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid ProposalId = Guid.NewGuid();
    private static readonly byte[] RowVersion = [1, 2, 3, 4, 5, 6, 7, 8];
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 5, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Never_passed_proposal_is_stamped_audited_and_saved_once()
    {
        var proposal = Proposal();
        var audits = new List<AuditLog>();
        var saves = 0;
        var handler = Handler(proposal, results: [Result("FAIL")], audits, () => saves++);

        var view = await handler.Handle(Command(), default);

        Assert.Equal(Now, proposal.DiscardedAt);
        Assert.Equal(ActorId, proposal.DiscardedByUserId);
        Assert.Equal(Now, proposal.UpdatedAt);
        Assert.Equal(1, saves);
        var audit = Assert.Single(audits);
        Assert.Equal("POI_PROPOSAL_DISCARDED", audit.Action);
        Assert.Equal(ProposalId.ToString("D"), audit.EntityId);
        Assert.Equal(Now, view.DiscardedAt);
        Assert.False(view.CanDiscard);
    }

    [Fact]
    public async Task Proposal_with_a_pass_on_any_revision_is_refused_without_writes()
    {
        var proposal = Proposal();
        var audits = new List<AuditLog>();
        var saves = 0;
        var handler = Handler(proposal, results: [Result("PASS"), Result("FAIL")], audits, () => saves++);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(Command(), default));

        Assert.Equal("POI_PROPOSAL_HAS_PASS", error.Code);
        Assert.Null(proposal.DiscardedAt);
        Assert.Empty(audits);
        Assert.Equal(0, saves);
    }

    [Fact]
    public async Task Stale_version_is_refused_before_any_write()
    {
        var proposal = Proposal();
        var audits = new List<AuditLog>();
        var handler = Handler(proposal, results: [], audits, () => { });

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new DiscardPoiProposalCommand(ActorId, ProposalId, new(1, Convert.ToBase64String(new byte[8]))), default));

        Assert.Equal("STALE_VERSION", error.Code);
        Assert.Null(proposal.DiscardedAt);
        Assert.Empty(audits);
    }

    [Fact]
    public async Task Retry_of_an_already_discarded_proposal_returns_it_unchanged()
    {
        var earlier = Now.AddMinutes(-5);
        var proposal = Proposal();
        proposal.DiscardedAt = earlier;
        proposal.DiscardedByUserId = ActorId;
        var audits = new List<AuditLog>();
        var saves = 0;
        var handler = Handler(proposal, results: [], audits, () => saves++);

        // The retry carries the version it saw before the first discard changed the rowversion.
        var view = await handler.Handle(new DiscardPoiProposalCommand(ActorId, ProposalId, new(1, Convert.ToBase64String(new byte[8]))), default);

        Assert.Equal(earlier, view.DiscardedAt);
        Assert.Empty(audits);
        Assert.Equal(0, saves);
    }

    [Fact]
    public async Task Submit_of_a_discarded_proposal_is_refused_before_any_write()
    {
        var proposal = Proposal();
        proposal.DiscardedAt = Now;
        proposal.DiscardedByUserId = ActorId;
        var writes = 0;
        var handler = new SubmitPoiProposalCommandHandler(
            Proxy<IMapVersionRepository>(method => throw new NotImplementedException(method.Name)),
            Proxy<IPoiProposalRepository>(method => method.Name switch
            {
                nameof(IPoiProposalRepository.FindSubmissionRequestAsync) => Task.FromResult<PoiProposalSubmission?>(null),
                nameof(IPoiProposalRepository.LockProposalAsync) => Task.FromResult<PoiProposal?>(proposal),
                nameof(IPoiProposalRepository.Add) or nameof(IPoiProposalRepository.AddAuditLog) => writes++,
                _ => throw new NotImplementedException(method.Name)
            }),
            Proxy<IPoiVerificationRepository>(method => throw new NotImplementedException(method.Name)),
            Proxy<IMapPoiRequestLock>(_ => Task.CompletedTask),
            Proxy<IApplicationDbContext>(_ => Task.FromResult(0)), TimeProvider.System);

        var error = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new SubmitPoiProposalCommand(ActorId, ProposalId, new(Guid.NewGuid(), 1, Convert.ToBase64String(RowVersion))), default));

        Assert.Equal("POI_PROPOSAL_DISCARDED", error.Code);
        Assert.Equal(0, writes);
    }

    [Fact]
    public void Validator_requires_the_expected_version()
    {
        var result = new DiscardPoiProposalCommandValidator().Validate(new DiscardPoiProposalCommand(ActorId, ProposalId, new(0, "")));

        Assert.Equal(2, result.Errors.Count);
    }

    private static DiscardPoiProposalCommand Command() =>
        new(ActorId, ProposalId, new(1, Convert.ToBase64String(RowVersion)));

    private static PoiProposal Proposal() => new()
    {
        Id = ProposalId, CurrentRevision = 1, RowVersion = RowVersion, CreatedAt = Now.AddDays(-1)
    };

    private static PoiVerificationRecord Result(string code) => new()
    {
        Id = Guid.NewGuid(), ProposalRevisionId = Guid.NewGuid(), ResultCode = code, NavigationFingerprint = new byte[32]
    };

    private static DiscardPoiProposalCommandHandler Handler(PoiProposal proposal, IReadOnlyList<PoiVerificationRecord> results,
        List<AuditLog> audits, Action save)
    {
        var revision = new PoiProposalRevision
        {
            Id = Guid.NewGuid(), ProposalId = ProposalId, RevisionNumber = 1, MapVersionId = Guid.NewGuid(),
            MapVersion = new MapVersion { MapKey = "pilot-v1" }, Name = "POI", Purpose = "Giới thiệu", CameraPreset = "FRONT",
            NavigationFingerprint = new byte[32]
        };
        var proposals = Proxy<IPoiProposalRepository>(method => method.Name switch
        {
            nameof(IPoiProposalRepository.LockProposalAsync) => Task.FromResult<PoiProposal?>(proposal),
            nameof(IPoiProposalRepository.FindCurrentRevisionAsync) => Task.FromResult<PoiProposalRevision?>(revision),
            nameof(IPoiProposalRepository.FindSubmissionAsync) => Task.FromResult<PoiProposalSubmission?>(null),
            _ => throw new NotImplementedException(method.Name)
        }, args => audits.Add((AuditLog)args[0]!));
        var verifications = Proxy<IPoiVerificationRepository>(method => method.Name switch
        {
            nameof(IPoiVerificationRepository.ListVerificationRecordsAsync) => Task.FromResult(results),
            nameof(IPoiVerificationRepository.FindLatestVerificationByFingerprintAsync) => Task.FromResult<PoiVerificationRecord?>(null),
            _ => throw new NotImplementedException(method.Name)
        });
        var dbContext = Proxy<IApplicationDbContext>(_ =>
        {
            save();
            return Task.FromResult(1);
        });
        return new DiscardPoiProposalCommandHandler(proposals, verifications, dbContext, new FixedTime(Now));
    }

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static T Proxy<T>(Func<MethodInfo, object?> handler, Action<object?[]>? onAudit = null) where T : class
    {
        var proxy = DispatchProxy.Create<T, StubProxy>();
        ((StubProxy)(object)proxy).Handler = handler;
        ((StubProxy)(object)proxy).OnAudit = onAudit;
        return proxy;
    }

    public class StubProxy : DispatchProxy
    {
        internal Func<MethodInfo, object?> Handler { get; set; } = null!;
        internal Action<object?[]>? OnAudit { get; set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            var method = targetMethod ?? throw new InvalidOperationException("Missing method metadata.");
            if (method.Name == "AddAuditLog" && OnAudit is not null)
            {
                OnAudit(args ?? []);
                return null;
            }
            return Handler(method);
        }
    }
}
