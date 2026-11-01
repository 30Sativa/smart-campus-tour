using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ImportPoiFilesCommand(Guid ActorUserId, ImportPoiFilesRequest Request)
    : IPoiMutationCommand<PoiImportResult>;

public sealed class ImportPoiFilesCommandValidator : AbstractValidator<ImportPoiFilesCommand>
{
    // The stored note also carries the file name, which may be 255 characters, in a 2000-character column.
    public const int MaxEvidenceNoteLength = 1700;

    public ImportPoiFilesCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.MapVersionId).NotEmpty();
        RuleFor(command => command.Request.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(command => command.Request.EvidenceNote).Must(note => !string.IsNullOrWhiteSpace(note))
            .WithMessage("Cần nhập ghi chú bằng chứng.").MaximumLength(MaxEvidenceNoteLength);
    }
}

public sealed class ImportPoiFilesCommandHandler(
    IMapVersionRepository mapRepository,
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IPoiImportRepository importRepository,
    IMapPoiRequestLock requestLock,
    MapPoiSettings settings,
    TimeProvider timeProvider)
    : IRequestHandler<ImportPoiFilesCommand, PoiImportResult>
{
    // Purpose is required on a revision; Staff replaces this with real content later.
    private const string ImportedPurpose = "Nhập từ tệp ghi pose trên robot";

    public async Task<PoiImportResult> Handle(ImportPoiFilesCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var sources = PoiImportFileSet.Expand(request.Files);
        var robotCode = request.RobotCode.Trim();
        var evidenceNote = request.EvidenceNote.Trim();
        var parsed = PoiImportPlanner.Parse(sources);
        var requestHash = MapPoiRequestHash.Compute(new
        {
            request.MapVersionId, RobotCode = robotCode, EvidenceNote = evidenceNote,
            Files = parsed.OrderBy(file => file.Source.FileName, StringComparer.Ordinal)
                .Select(file => new { file.Source.FileName, Sha256 = Convert.ToHexString(file.Sha256) })
        });

        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, "poi-import", cancellationToken);
        var prior = await importRepository.ListImportRequestReceiptsAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior.Count > 0)
        {
            MapPoiRequestIdempotency.EnsureSameRequest(prior[0].RequestHash, requestHash);
            return ToResult(request, prior);
        }

        var map = await mapRepository.FindMapVersionAsync(request.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", request.MapVersionId);
        var robot = await mapRepository.FindPhysicalRobotAsync(robotCode, cancellationToken)
            ?? throw new NotFoundException("Physical robot", robotCode);

        // Same order as the Staff and verification writers: area, proposals, map, robot.
        await mapRepository.LockAreaAsync(map.AreaKey, cancellationToken);
        var sourceIds = parsed.Where(file => file.Capture is not null).Select(file => file.Capture!.Id)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var existing = sourceIds.Length == 0 ? [] : await importRepository.ListProposalsBySourceAsync(map.AreaKey, sourceIds, cancellationToken);
        var locked = new Dictionary<Guid, PoiProposal>();
        foreach (var proposal in existing.OrderBy(item => item.Id))
            locked[proposal.Id] = await proposalRepository.LockProposalAsync(proposal.Id, cancellationToken)
                ?? throw new NotFoundException("POI proposal", proposal.Id);
        await mapRepository.LockMapPreparationStateAsync(map.Id, cancellationToken);
        await mapRepository.LockRobotDeploymentStateAsync(robot.Id, cancellationToken);
        RobotLifecycleRules.EnsureActive(robot);

        var planned = await PoiImportPlanner.PlanAsync(importRepository, mapRepository, map, robot, parsed, settings, cancellationToken);
        var failures = planned.Where(file => file.ErrorCode is not null).ToArray();
        if (failures.Length > 0)
            throw new ConflictException($"Không nhập tệp nào vì {failures.Length} tệp lỗi. Sửa các tệp lỗi rồi thử lại.", "POI_IMPORT_INVALID",
                failures.GroupBy(file => file.File.Source.FileName, StringComparer.Ordinal).ToDictionary(group => group.Key,
                    group => group.Select(file => $"{file.ErrorCode}: {file.ErrorMessage}").ToArray()));

        var now = timeProvider.GetUtcNow();
        var receipts = new List<PoiImportReceipt>(planned.Count);
        foreach (var file in planned)
        {
            var receipt = file.PriorReceipt is { } applied
                ? Receipt(command, requestHash, map, robot, file, PoiImportActions.NoChange, applied.ProposalId, applied.ProposalRevisionId, now)
                : await ApplyAsync(command, requestHash, evidenceNote, map, robot, file, locked, now, cancellationToken);
            importRepository.Add(receipt);
            receipts.Add(receipt);
        }

        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            RobotId = robot.Id,
            Action = "POI_POSE_IMPORT_COMPLETED",
            EntityType = "PoiImport",
            EntityId = request.RequestId.ToString("D"),
            ResultCode = "IMPORTED",
            DataJson = JsonSerializer.Serialize(new
            {
                mapVersionId = map.Id, map.MapKey, robot.RobotCode,
                files = receipts.Select(receipt => new
                {
                    receipt.FileName, receipt.SourcePoiId, receipt.Action, receipt.Verified, receipt.ProposalId,
                    fileSha256 = Convert.ToHexString(receipt.FileSha256).ToLowerInvariant()
                })
            }),
            OccurredAt = now
        });
        return ToResult(request, receipts);
    }

    private async Task<PoiImportReceipt> ApplyAsync(ImportPoiFilesCommand command, byte[] requestHash, string evidenceNote,
        MapVersion map, Robot robot, PoiImportPlannedFile file, Dictionary<Guid, PoiProposal> locked, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var capture = file.File.Capture!;
        var (proposal, draft, number) = file.Action == PoiImportActions.Create
            ? (CreateProposal(command, requestHash, map, file, now), NewDraft(map, file), 1)
            : await NextRevisionAsync(map, file, locked[file.Proposal!.Id], now, cancellationToken);

        var revisionRequestId = DerivedId(command, file, "revision");
        var revision = PoiProposalRules.CreateRevision(proposal.Id, number, command.ActorUserId, revisionRequestId,
            file.File.Sha256, draft, now);
        revision.MapVersion = map;
        proposalRepository.Add(revision);
        proposalRepository.Add(new PoiProposalSubmission
        {
            Id = Guid.NewGuid(),
            ProposalRevisionId = revision.Id,
            SubmittedByUserId = command.ActorUserId,
            RequestId = DerivedId(command, file, "submission"),
            RequestHash = file.File.Sha256,
            SubmittedAt = now
        });
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = file.Action == PoiImportActions.Create ? "POI_PROPOSAL_CREATED" : "POI_PROPOSAL_REVISION_CREATED",
            EntityType = "PoiProposal",
            EntityId = proposal.Id.ToString("D"),
            ResultCode = "SUBMITTED",
            DataJson = JsonSerializer.Serialize(new { revision = number, mapVersionId = map.Id, map.MapKey, sourcePoiId = capture.Id }),
            OccurredAt = now
        });

        if (capture.Verified)
        {
            verificationRepository.Add(new PoiVerificationRecord
            {
                Id = Guid.NewGuid(),
                ProposalRevisionId = revision.Id,
                MapVersionId = map.Id,
                RobotId = robot.Id,
                NavigationFingerprint = revision.NavigationFingerprint,
                ResultCode = "PASS",
                VerificationMethod = PoiVerificationMethods.PoseCapture,
                SourceFileSha256 = file.File.Sha256,
                SourceFileContent = file.File.Source.Content,
                EvidenceNote = $"{evidenceNote}\nTệp: {file.File.Source.FileName}",
                CheckedByUserId = command.ActorUserId,
                RequestId = DerivedId(command, file, "verification"),
                RequestHash = file.File.Sha256,
                CheckedAt = now,
            });
            verificationRepository.AddAuditLog(new AuditLog
            {
                ActorUserId = command.ActorUserId,
                RobotId = robot.Id,
                Action = "POI_POSE_CAPTURE_VERIFIED",
                EntityType = "PoiProposalRevision",
                EntityId = revision.Id.ToString("D"),
                ResultCode = "PASS",
                DataJson = JsonSerializer.Serialize(new { proposalId = proposal.Id, revision = number, mapVersionId = map.Id,
                    verificationMethod = PoiVerificationMethods.PoseCapture, fileSha256 = file.FileSha256 }),
                OccurredAt = now
            });
        }
        return Receipt(command, requestHash, map, robot, file, file.Action!, proposal.Id, revision.Id, now);
    }

    private PoiProposal CreateProposal(ImportPoiFilesCommand command, byte[] requestHash, MapVersion map,
        PoiImportPlannedFile file, DateTimeOffset now)
    {
        var proposal = new PoiProposal
        {
            Id = Guid.NewGuid(),
            CreatedByUserId = command.ActorUserId,
            CreateRequestId = DerivedId(command, file, "proposal"),
            CreateRequestHash = requestHash,
            CurrentRevision = 1,
            CreatedAt = now,
            SourceAreaKey = map.AreaKey,
            SourcePoiId = file.File.Capture!.Id
        };
        proposalRepository.Add(proposal);
        return proposal;
    }

    private static PoiProposalDraft NewDraft(MapVersion map, PoiImportPlannedFile file) => new(
        map.Id, file.File.Capture!.Name, ImportedPurpose, null, file.X!.Value, file.Y!.Value, file.Yaw!.Value,
        PoiImportPlanner.DefaultCameraPreset);

    /// <summary>A new capture replaces map and pose only; name and narration already belong to Staff.</summary>
    private async Task<(PoiProposal Proposal, PoiProposalDraft Draft, int Number)> NextRevisionAsync(
        MapVersion map, PoiImportPlannedFile file, PoiProposal proposal, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var current = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        var number = proposal.CurrentRevision + 1;
        proposal.CurrentRevision = number;
        proposal.UpdatedAt = now;
        return (proposal, new PoiProposalDraft(map.Id, current.Name, current.Purpose, current.Description,
            file.X!.Value, file.Y!.Value, file.Yaw!.Value, current.CameraPreset, current.NarrationText, current.FallbackVideoUrl), number);
    }

    private static PoiImportReceipt Receipt(ImportPoiFilesCommand command, byte[] requestHash, MapVersion map, Robot robot,
        PoiImportPlannedFile file, string action, Guid proposalId, Guid revisionId, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        RequestId = command.Request.RequestId,
        RequestHash = requestHash,
        ImportedByUserId = command.ActorUserId,
        MapVersionId = map.Id,
        RobotId = robot.Id,
        FileName = file.File.Source.FileName,
        FileSha256 = file.File.Sha256,
        SourcePoiId = file.File.Capture!.Id,
        Action = action,
        Verified = file.File.Capture.Verified,
        ProposalId = proposalId,
        ProposalRevisionId = revisionId,
        ImportedAt = now
    };

    private static PoiImportResult ToResult(ImportPoiFilesRequest request, IReadOnlyList<PoiImportReceipt> receipts) => new(
        request.RequestId, request.MapVersionId,
        ProposalIds(receipts, PoiImportActions.Create), ProposalIds(receipts, PoiImportActions.NewRevision),
        receipts.Select(receipt => new PoiImportedFile(receipt.FileName, receipt.SourcePoiId, receipt.Action, receipt.Verified,
            receipt.ProposalId, receipt.ProposalRevisionId)).ToArray());

    private static Guid[] ProposalIds(IReadOnlyList<PoiImportReceipt> receipts, string action) =>
        receipts.Where(receipt => receipt.Action == action).Select(receipt => receipt.ProposalId).Distinct().ToArray();

    // Each row's own unique key needs one id per file; deriving it keeps a retry stable.
    private static Guid DerivedId(ImportPoiFilesCommand command, PoiImportPlannedFile file, string purpose) =>
        new(SHA256.HashData(Encoding.UTF8.GetBytes($"{command.Request.RequestId:D}:{file.FileSha256}:{purpose}")).AsSpan(0, 16));
}
