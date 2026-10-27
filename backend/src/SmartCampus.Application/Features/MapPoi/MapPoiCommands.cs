using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record CreateMapVersionCommand(Guid ActorUserId, CreateMapVersionRequest Request)
    : IPoiMutationCommand<MapVersionView>;

public sealed class CreateMapVersionCommandValidator : AbstractValidator<CreateMapVersionCommand>
{
    public CreateMapVersionCommandValidator()
    {
        RuleFor(command => command.Request.AreaKey).NotEmpty().MaximumLength(80)
            .Matches("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$");
        RuleFor(command => command.Request.AreaName).NotEmpty().MaximumLength(150);
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.PackageBytes).NotEmpty()
            .Must(bytes => bytes.Length <= MapPackageValidator.MaxPackageBytes)
            .WithMessage($"Map package must not exceed {MapPackageValidator.MaxPackageBytes} bytes.");
    }
}

public sealed class CreateMapVersionCommandHandler(
    IVersionedMapPoiRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<CreateMapVersionCommand, MapVersionView>
{
    public async Task<MapVersionView> Handle(CreateMapVersionCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var areaKey = request.AreaKey.Trim();
        var areaName = request.AreaName.Trim();
        var package = MapPackageValidator.Validate(request.PackageBytes);
        var requestHash = MapPoiAlgorithms.RequestHash(new
        {
            AreaKey = areaKey,
            AreaName = areaName,
            Sha256 = Convert.ToHexString(package.Sha256)
        });

        await repository.LockRequestAsync(command.ActorUserId, request.RequestId, "map-upload", cancellationToken);
        var prior = await repository.FindMapUploadRequestAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior is not null)
        {
            EnsureSameRequest(prior.RequestHash, requestHash);
            return MapPoiAlgorithms.ToMapView(prior, prior.AreaKeyNavigation.DisplayName);
        }

        var area = await repository.LockAreaAsync(areaKey, cancellationToken);
        if (area is null)
        {
            area = new MapArea
            {
                AreaKey = areaKey,
                DisplayName = areaName,
                CreatedByUserId = command.ActorUserId,
                CreatedAt = timeProvider.GetUtcNow()
            };
            repository.Add(area);
        }
        else if (!string.Equals(area.DisplayName, areaName, StringComparison.Ordinal))
        {
            throw new ConflictException("The area key already belongs to a different display name.");
        }

        var version = await repository.GetNextMapVersionAsync(areaKey, cancellationToken);
        var mapKey = $"{areaKey}-v{version}";
        var now = timeProvider.GetUtcNow();
        var metadata = package.Metadata;
        var mapVersion = new MapVersion
        {
            Id = Guid.NewGuid(),
            AreaKey = areaKey,
            VersionNumber = version,
            MapKey = mapKey,
            PackageFileName = $"{mapKey}.zip",
            PackageSha256 = package.Sha256,
            RequestHash = requestHash,
            PackageBytes = request.PackageBytes,
            ImageFileName = metadata.ImageFileName,
            ImageWidth = metadata.ImageWidth,
            ImageHeight = metadata.ImageHeight,
            Resolution = metadata.Resolution,
            OriginX = metadata.OriginX,
            OriginY = metadata.OriginY,
            OriginYaw = metadata.OriginYaw,
            Negate = metadata.Negate,
            OccupiedThreshold = metadata.OccupiedThreshold,
            FreeThreshold = metadata.FreeThreshold,
            FrameId = metadata.FrameId,
            ValidationStatus = "VALID",
            UploadedByUserId = command.ActorUserId,
            UploadRequestId = request.RequestId,
            UploadedAt = now
        };
        repository.Add(mapVersion);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "MAP_VERSION_UPLOADED",
            EntityType = "MapVersion",
            EntityId = mapVersion.Id.ToString("D"),
            ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new { areaKey, version, mapVersion.MapKey, sha256 = Convert.ToHexString(package.Sha256).ToLowerInvariant() }),
            OccurredAt = now
        });
        return MapPoiAlgorithms.ToMapView(mapVersion, areaName);
    }

    internal static void EnsureSameRequest(byte[] storedHash, byte[] requestHash)
    {
        if (!CryptographicOperations.FixedTimeEquals(storedHash, requestHash))
            throw new ConflictException("This request ID was already used with different content.", "IDEMPOTENCY_CONFLICT");
    }
}

public sealed record RecordMapDeploymentCommand(Guid ActorUserId, Guid MapVersionId, RecordMapDeploymentRequest Request)
    : IPoiMutationCommand<MapDeploymentCheckView>;

public sealed class RecordMapDeploymentCommandValidator : AbstractValidator<RecordMapDeploymentCommand>
{
    public RecordMapDeploymentCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(command => command.Request.PackageSha256).Length(64).Matches("^[0-9a-fA-F]{64}$");
        RuleFor(command => command.Request.EvidenceNote).NotEmpty().MaximumLength(2000);
        RuleFor(command => command.ActorUserId).NotEmpty();
    }
}

public sealed class RecordMapDeploymentCommandHandler(
    IVersionedMapPoiRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<RecordMapDeploymentCommand, MapDeploymentCheckView>
{
    public async Task<MapDeploymentCheckView> Handle(RecordMapDeploymentCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var checksum = Convert.FromHexString(request.PackageSha256);
        var requestHash = MapPoiAlgorithms.RequestHash(new
        {
            command.MapVersionId,
            request.RobotCode,
            PackageSha256 = request.PackageSha256.ToLowerInvariant(),
            request.LocalizationPassed,
            request.DisplayPassed,
            EvidenceNote = request.EvidenceNote.Trim()
        });
        await repository.LockRequestAsync(command.ActorUserId, request.RequestId, "deployment-check", cancellationToken);
        var prior = await repository.FindDeploymentRequestAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior is not null)
        {
            CreateMapVersionCommandHandler.EnsureSameRequest(prior.RequestHash, requestHash);
            return MapPoiAlgorithms.ToDeploymentView(prior);
        }

        var map = await repository.FindMapVersionAsync(command.MapVersionId, includePackage: false, cancellationToken)
            ?? throw new NotFoundException("Map version", command.MapVersionId);
        if (!CryptographicOperations.FixedTimeEquals(map.PackageSha256, checksum))
            throw new ConflictException("Deployment evidence must name the exact uploaded package checksum.", "MAP_CHECKSUM_MISMATCH");
        var robot = await repository.FindPhysicalRobotAsync(request.RobotCode.Trim(), cancellationToken)
            ?? throw new NotFoundException("Physical robot", request.RobotCode.Trim());
        var now = timeProvider.GetUtcNow();
        var check = new MapDeploymentCheck
        {
            Id = Guid.NewGuid(),
            MapVersionId = map.Id,
            RobotId = robot.Id,
            PackageSha256 = checksum,
            LocalizationPassed = request.LocalizationPassed,
            DisplayPassed = request.DisplayPassed,
            EvidenceNote = request.EvidenceNote.Trim(),
            CheckedByUserId = command.ActorUserId,
            RequestId = request.RequestId,
            RequestHash = requestHash,
            CheckedAt = now
        };
        repository.Add(check);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            RobotId = robot.Id,
            Action = "MAP_DEPLOYMENT_CHECK_RECORDED",
            EntityType = "MapVersion",
            EntityId = map.Id.ToString("D"),
            ResultCode = check.LocalizationPassed && check.DisplayPassed ? "PASS" : "FAIL",
            DataJson = JsonSerializer.Serialize(new { robot.RobotCode, packageSha256 = request.PackageSha256.ToLowerInvariant(), check.LocalizationPassed, check.DisplayPassed }),
            OccurredAt = now
        });
        check.Robot = robot;
        return MapPoiAlgorithms.ToDeploymentView(check);
    }
}

public sealed record CreatePoiProposalCommand(Guid ActorUserId, CreatePoiProposalRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class CreatePoiProposalCommandValidator : AbstractValidator<CreatePoiProposalCommand>
{
    public CreatePoiProposalCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.Draft.MapVersionId).NotEmpty();
        MapPoiValidationRules.AddDraftRules(RuleFor(command => command.Request.Draft));
    }
}

public sealed class CreatePoiProposalCommandHandler(
    IVersionedMapPoiRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<CreatePoiProposalCommand, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(CreatePoiProposalCommand command, CancellationToken cancellationToken)
    {
        var draft = MapPoiValidationRules.Normalize(command.Request.Draft);
        var draftHash = MapPoiAlgorithms.RequestHash(draft);
        var requestHash = MapPoiAlgorithms.RequestHash(new { command.Request.RequestId, Draft = draft });
        await repository.LockRequestAsync(command.ActorUserId, command.Request.RequestId, "poi-create", cancellationToken);
        var prior = await repository.FindProposalCreateRequestAsync(command.ActorUserId, command.Request.RequestId, cancellationToken);
        if (prior is not null)
        {
            CreateMapVersionCommandHandler.EnsureSameRequest(prior.CreateRequestHash, requestHash);
            return await MapPoiViewFactory.CreateProposalViewAsync(repository, prior,
                await repository.FindCurrentRevisionAsync(prior.Id, cancellationToken) ?? throw new ConflictException("The proposal has no revision."),
                cancellationToken);
        }

        var map = await repository.FindMapVersionAsync(draft.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", draft.MapVersionId);
        ValidatePosition(map, draft);
        var now = timeProvider.GetUtcNow();
        var proposal = new PoiProposal
        {
            Id = Guid.NewGuid(),
            CreatedByUserId = command.ActorUserId,
            CreateRequestId = command.Request.RequestId,
            CreateRequestHash = requestHash,
            CurrentRevision = 1,
            CreatedAt = now
        };
        var revision = CreateRevision(proposal.Id, 1, command.ActorUserId, command.Request.RequestId, draftHash, draft, now);
        revision.MapVersion = map;
        repository.Add(proposal);
        repository.Add(revision);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_PROPOSAL_CREATED",
            EntityType = "PoiProposal",
            EntityId = proposal.Id.ToString("D"),
            ResultCode = "DRAFT",
            DataJson = JsonSerializer.Serialize(new { revision = revision.RevisionNumber, mapVersionId = map.Id, revision.MapVersion.MapKey }),
            OccurredAt = now
        });
        // SQL rowversion is generated by the database; flush inside the surrounding
        // serializable transaction so the returned draft can be safely edited.
        await repository.FlushAsync(cancellationToken);
        return await MapPoiViewFactory.CreateProposalViewAsync(repository, proposal, revision, cancellationToken);
    }

    internal static void ValidatePosition(MapVersion map, PoiProposalDraft draft)
    {
        if (draft.X != decimal.Round(draft.X, 4) || draft.Y != decimal.Round(draft.Y, 4) ||
            draft.Yaw != decimal.Round(draft.Yaw, 6) || draft.X is < -999999.9999m or > 999999.9999m ||
            draft.Y is < -999999.9999m or > 999999.9999m)
            throw new ValidationException("POI coordinates must fit the persisted meter/radian precision.");
        var package = MapPackageValidator.Validate(map.PackageBytes);
        MapPackageValidator.EnsureFreePosition(package, draft.X, draft.Y, draft.Yaw);
    }

    internal static PoiProposalRevision CreateRevision(Guid proposalId, int revisionNumber, Guid actorUserId,
        Guid requestId, byte[] requestHash, PoiProposalDraft draft, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        ProposalId = proposalId,
        RevisionNumber = revisionNumber,
        MapVersionId = draft.MapVersionId,
        Name = draft.Name,
        Purpose = draft.Purpose,
        Description = draft.Description,
        X = draft.X,
        Y = draft.Y,
        Yaw = draft.Yaw,
        CameraPreset = draft.CameraPreset,
        NavigationFingerprint = MapPoiAlgorithms.NavigationFingerprint(draft),
        RequestId = requestId,
        RequestHash = requestHash,
        CreatedByUserId = actorUserId,
        CreatedAt = now
    };
}

public sealed record CreatePoiRevisionCommand(Guid ActorUserId, Guid ProposalId, CreatePoiRevisionRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class CreatePoiRevisionCommandValidator : AbstractValidator<CreatePoiRevisionCommand>
{
    public CreatePoiRevisionCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedCurrentRevision).GreaterThan(0);
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
        RuleFor(command => command.Request.Draft.MapVersionId).NotEmpty();
        MapPoiValidationRules.AddDraftRules(RuleFor(command => command.Request.Draft));
    }
}

public sealed class CreatePoiRevisionCommandHandler(
    IVersionedMapPoiRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<CreatePoiRevisionCommand, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(CreatePoiRevisionCommand command, CancellationToken cancellationToken)
    {
        var draft = MapPoiValidationRules.Normalize(command.Request.Draft);
        var contentHash = MapPoiAlgorithms.RequestHash(draft);
        await repository.LockRequestAsync(command.ActorUserId, command.Request.RequestId, $"poi-revision:{command.ProposalId:D}", cancellationToken);
        var priorRevision = await repository.FindRevisionRequestAsync(command.ProposalId, command.Request.RequestId, cancellationToken);
        if (priorRevision is not null)
        {
            CreateMapVersionCommandHandler.EnsureSameRequest(priorRevision.RequestHash, contentHash);
            var priorProposal = await repository.FindProposalAsync(command.ProposalId, cancellationToken)
                ?? throw new NotFoundException("POI proposal", command.ProposalId);
            return await MapPoiViewFactory.CreateProposalViewAsync(repository, priorProposal,
                await repository.FindCurrentRevisionAsync(command.ProposalId, cancellationToken) ?? priorRevision, cancellationToken);
        }

        var proposal = await repository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        EnsureCurrent(proposal, command.Request.ExpectedCurrentRevision, command.Request.ExpectedRowVersion);
        var previous = await repository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        var submission = await repository.FindSubmissionAsync(previous.Id, cancellationToken);
        var priorResult = await repository.FindVerificationAsync(previous.Id, cancellationToken);
        if (submission is not null && priorResult is null)
            throw new ConflictException("A submitted POI revision must receive a technical result before it can be edited.");

        var map = await repository.FindMapVersionAsync(draft.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", draft.MapVersionId);
        CreatePoiProposalCommandHandler.ValidatePosition(map, draft);
        var now = timeProvider.GetUtcNow();
        var nextNumber = proposal.CurrentRevision + 1;
        var revision = CreatePoiProposalCommandHandler.CreateRevision(proposal.Id, nextNumber,
            command.ActorUserId, command.Request.RequestId, contentHash, draft, now);
        revision.MapVersion = map;
        proposal.CurrentRevision = nextNumber;
        proposal.UpdatedAt = now;
        repository.Add(revision);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_PROPOSAL_REVISION_CREATED",
            EntityType = "PoiProposal",
            EntityId = proposal.Id.ToString("D"),
            ResultCode = "DRAFT",
            DataJson = JsonSerializer.Serialize(new { revision = nextNumber, mapVersionId = map.Id, movementChanged = !CryptographicOperations.FixedTimeEquals(previous.NavigationFingerprint, revision.NavigationFingerprint) }),
            OccurredAt = now
        });
        await repository.FlushAsync(cancellationToken);
        return await MapPoiViewFactory.CreateProposalViewAsync(repository, proposal, revision, cancellationToken);
    }

    internal static void EnsureCurrent(PoiProposal proposal, int expectedRevision, string expectedRowVersion)
    {
        if (proposal.CurrentRevision != expectedRevision ||
            !proposal.RowVersion.AsSpan().SequenceEqual(PoiProposalRowVersion.Decode(expectedRowVersion)))
            throw new ConflictException("The proposal changed since it was loaded. Reload it before retrying.", "STALE_VERSION");
    }
}

public sealed record SubmitPoiProposalCommand(Guid ActorUserId, Guid ProposalId, SubmitPoiProposalRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class SubmitPoiProposalCommandValidator : AbstractValidator<SubmitPoiProposalCommand>
{
    public SubmitPoiProposalCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRevisionNumber).GreaterThan(0);
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class SubmitPoiProposalCommandHandler(
    IVersionedMapPoiRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<SubmitPoiProposalCommand, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(SubmitPoiProposalCommand command, CancellationToken cancellationToken)
    {
        var requestHash = MapPoiAlgorithms.RequestHash(new { command.ProposalId, command.Request.ExpectedRevisionNumber });
        await repository.LockRequestAsync(command.ActorUserId, command.Request.RequestId, $"poi-submit:{command.ProposalId:D}", cancellationToken);
        var priorSubmission = await repository.FindSubmissionRequestAsync(command.ActorUserId, command.Request.RequestId, cancellationToken);
        if (priorSubmission is not null)
        {
            CreateMapVersionCommandHandler.EnsureSameRequest(priorSubmission.RequestHash, requestHash);
            var proposalPrior = await repository.FindProposalAsync(command.ProposalId, cancellationToken)
                ?? throw new NotFoundException("POI proposal", command.ProposalId);
            return await MapPoiViewFactory.CreateProposalViewAsync(repository, proposalPrior,
                await repository.FindCurrentRevisionAsync(command.ProposalId, cancellationToken) ?? throw new ConflictException("The proposal has no current revision."),
                cancellationToken);
        }

        var proposal = await repository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        CreatePoiRevisionCommandHandler.EnsureCurrent(proposal, command.Request.ExpectedRevisionNumber, command.Request.ExpectedRowVersion);
        var revision = await repository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        if (await repository.FindSubmissionAsync(revision.Id, cancellationToken) is not null)
            throw new ConflictException("This POI revision has already been submitted.");

        var now = timeProvider.GetUtcNow();
        var submission = new PoiProposalSubmission
        {
            Id = Guid.NewGuid(),
            ProposalRevisionId = revision.Id,
            SubmittedByUserId = command.ActorUserId,
            RequestId = command.Request.RequestId,
            RequestHash = requestHash,
            SubmittedAt = now
        };
        repository.Add(submission);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_PROPOSAL_SUBMITTED",
            EntityType = "PoiProposalRevision",
            EntityId = revision.Id.ToString("D"),
            ResultCode = "SUBMITTED",
            DataJson = JsonSerializer.Serialize(new { revision.ProposalId, revision.RevisionNumber, revision.MapVersionId }),
            OccurredAt = now
        });
        await repository.FlushAsync(cancellationToken);
        return await MapPoiViewFactory.CreateProposalViewAsync(repository, proposal, revision, cancellationToken);
    }
}

public sealed record RecordPoiVerificationCommand(Guid ActorUserId, Guid ProposalId, int RevisionNumber, VerifyPoiProposalRequest Request)
    : IPoiMutationCommand<PoiVerificationView>;

public sealed class RecordPoiVerificationCommandValidator : AbstractValidator<RecordPoiVerificationCommand>
{
    public RecordPoiVerificationCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.RevisionNumber).GreaterThan(0);
        RuleFor(command => command.Request.ExpectedRevisionNumber).Equal(command => command.RevisionNumber);
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
        RuleFor(command => command.Request.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(command => command.Request.ResultCode).Must(value => value is "PASS" or "FAIL" or "Pass" or "Fail" or "pass" or "fail");
        RuleFor(command => command.Request.EvidenceNote).NotEmpty().MaximumLength(2000);
        RuleFor(command => command.Request.Reason).MaximumLength(1000);
    }
}

public sealed class RecordPoiVerificationCommandHandler(
    IVersionedMapPoiRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<RecordPoiVerificationCommand, PoiVerificationView>
{
    public async Task<PoiVerificationView> Handle(RecordPoiVerificationCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var resultCode = request.ResultCode.Trim().ToUpperInvariant();
        var normalizedEvidence = request.EvidenceNote.Trim();
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        var requestHash = MapPoiAlgorithms.RequestHash(new
        {
            command.ProposalId, command.RevisionNumber, request.RobotCode,
            ResultCode = resultCode, request.Reached, request.Stopped, request.LocalizationPassed,
            request.CameraPresetConfirmed, Reason = reason, EvidenceNote = normalizedEvidence
        });
        await repository.LockRequestAsync(command.ActorUserId, request.RequestId, $"poi-verification:{command.ProposalId:D}", cancellationToken);
        var prior = await repository.FindVerificationRequestAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior is not null)
        {
            CreateMapVersionCommandHandler.EnsureSameRequest(prior.RequestHash, requestHash);
            return MapPoiAlgorithms.ToVerificationView(prior);
        }

        var proposal = await repository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        CreatePoiRevisionCommandHandler.EnsureCurrent(proposal, command.RevisionNumber, request.ExpectedRowVersion);
        var revision = await repository.FindRevisionAsync(command.ProposalId, command.RevisionNumber, cancellationToken)
            ?? throw new NotFoundException("POI proposal revision", command.RevisionNumber);
        if (await repository.FindSubmissionAsync(revision.Id, cancellationToken) is null)
            throw new ConflictException("A POI proposal must be submitted before technical verification.");
        if (await repository.FindVerificationAsync(revision.Id, cancellationToken) is not null)
            throw new ConflictException("A technical result already exists for this immutable POI revision.");
        if (resultCode == "PASS" && !(request.Reached && request.Stopped && request.LocalizationPassed && request.CameraPresetConfirmed))
            throw new ValidationException("A passing result requires reach, stop, localization and camera-preset confirmation.");
        if (resultCode == "FAIL" && (reason is null || (request.Reached && request.Stopped && request.LocalizationPassed && request.CameraPresetConfirmed)))
            throw new ValidationException("A rejected result requires a reason and at least one failed observation.");

        var robot = await repository.FindPhysicalRobotAsync(request.RobotCode.Trim(), cancellationToken)
            ?? throw new NotFoundException("Physical robot", request.RobotCode.Trim());
        var latestDeployment = await repository.GetLatestDeploymentCheckAsync(revision.MapVersionId, robot.Id, cancellationToken);
        var map = await repository.FindMapVersionAsync(revision.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", revision.MapVersionId);
        if (latestDeployment is null || !latestDeployment.LocalizationPassed || !latestDeployment.DisplayPassed ||
            !CryptographicOperations.FixedTimeEquals(latestDeployment.PackageSha256, map.PackageSha256))
            throw new ConflictException("The exact map version must have a current successful localization/display deployment check on this robot.", "MAP_NOT_DEPLOYED");

        CreatePoiProposalCommandHandler.ValidatePosition(map, new PoiProposalDraft(
            revision.MapVersionId, revision.Name, revision.Purpose, revision.Description,
            revision.X, revision.Y, revision.Yaw, revision.CameraPreset));
        var now = timeProvider.GetUtcNow();
        var result = new PoiVerificationRecord
        {
            Id = Guid.NewGuid(),
            ProposalRevisionId = revision.Id,
            MapVersionId = revision.MapVersionId,
            RobotId = robot.Id,
            NavigationFingerprint = revision.NavigationFingerprint,
            ResultCode = resultCode,
            Reached = request.Reached,
            Stopped = request.Stopped,
            LocalizationPassed = request.LocalizationPassed,
            CameraPresetConfirmed = request.CameraPresetConfirmed,
            Reason = reason,
            EvidenceNote = normalizedEvidence,
            CheckedByUserId = command.ActorUserId,
            RequestId = request.RequestId,
            RequestHash = requestHash,
            CheckedAt = now,
        };
        repository.Add(result);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            RobotId = robot.Id,
            Action = resultCode == "PASS" ? "POI_TECHNICAL_VERIFIED" : "POI_TECHNICAL_REJECTED",
            EntityType = "PoiProposalRevision",
            EntityId = revision.Id.ToString("D"),
            ResultCode = resultCode,
            DataJson = JsonSerializer.Serialize(new { revision.ProposalId, revision.RevisionNumber, revision.MapVersionId,
                request.Reached, request.Stopped, request.LocalizationPassed, request.CameraPresetConfirmed }),
            OccurredAt = now
        });
        return MapPoiAlgorithms.ToVerificationView(result, revision, map.MapKey, robot.RobotCode);
    }
}

internal static class MapPoiValidationRules
{
    public static void AddDraftRules<T>(IRuleBuilderInitial<T, PoiProposalDraft> rules)
    {
        rules.Must(draft => !string.IsNullOrWhiteSpace(draft.Name) && draft.Name.Trim().Length <= 150)
            .WithMessage("POI name is required and must not exceed 150 characters.");
        rules.Must(draft => !string.IsNullOrWhiteSpace(draft.Purpose) && draft.Purpose.Trim().Length <= 500)
            .WithMessage("POI purpose is required and must not exceed 500 characters.");
        rules.Must(draft => draft.Description is null || draft.Description.Length <= 2000)
            .WithMessage("POI description must not exceed 2000 characters.");
        rules.Must(draft => !string.IsNullOrWhiteSpace(draft.CameraPreset) &&
                            draft.CameraPreset.Trim().Length <= 80 &&
                            draft.CameraPreset.Trim().All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.'))
            .WithMessage("Camera preset must be a bounded identifier containing letters, digits, '.', '_' or '-'.");
    }

    public static PoiProposalDraft Normalize(PoiProposalDraft draft) => draft with
    {
        Name = draft.Name.Trim(), Purpose = draft.Purpose.Trim(),
        Description = string.IsNullOrWhiteSpace(draft.Description) ? null : draft.Description.Trim(),
        CameraPreset = draft.CameraPreset.Trim().ToUpperInvariant()
    };
}

internal static class MapPoiViewFactory
{
    public static PoiRevisionView ToRevisionView(PoiProposalRevision revision, PoiProposalSubmission? submission,
        PoiVerificationRecord? verification) => new(revision.Id, revision.RevisionNumber, revision.MapVersionId,
        revision.MapVersion.MapKey, revision.Name, revision.Purpose, revision.Description, revision.X, revision.Y,
        revision.Yaw, revision.CameraPreset, Convert.ToHexString(revision.NavigationFingerprint).ToLowerInvariant(),
        revision.CreatedByUserId, revision.CreatedAt, submission is not null, submission?.SubmittedAt,
        verification?.ResultCode ?? "NOT_CHECKED", verification?.ProposalRevisionId);

    public static async Task<PoiProposalView> CreateProposalViewAsync(
        IVersionedMapPoiRepository repository, PoiProposal proposal, PoiProposalRevision revision,
        CancellationToken cancellationToken)
    {
        var submitted = await repository.FindSubmissionAsync(revision.Id, cancellationToken);
        var verification = await repository.FindLatestVerificationByFingerprintAsync(
            proposal.Id, revision.NavigationFingerprint, cancellationToken);
        var view = new PoiRevisionView(revision.Id, revision.RevisionNumber, revision.MapVersionId,
            revision.MapVersion.MapKey, revision.Name, revision.Purpose, revision.Description,
            revision.X, revision.Y, revision.Yaw, revision.CameraPreset,
            Convert.ToHexString(revision.NavigationFingerprint).ToLowerInvariant(), revision.CreatedByUserId,
            revision.CreatedAt, submitted is not null, submitted?.SubmittedAt,
            verification?.ResultCode ?? "NOT_CHECKED", verification?.ProposalRevisionId);
        return new PoiProposalView(proposal.Id, proposal.CurrentRevision,
            Convert.ToBase64String(proposal.RowVersion), proposal.CreatedAt, proposal.UpdatedAt, view);
    }
}
