using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

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
    IMapVersionRepository mapRepository,
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IMapPoiRequestLock requestLock,
    TimeProvider timeProvider)
    : IRequestHandler<RecordPoiVerificationCommand, PoiVerificationView>
{
    public async Task<PoiVerificationView> Handle(RecordPoiVerificationCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var resultCode = request.ResultCode.Trim().ToUpperInvariant();
        var normalizedEvidence = request.EvidenceNote.Trim();
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        var requestHash = MapPoiRequestHash.Compute(new
        {
            command.ProposalId, command.RevisionNumber, request.RobotCode,
            ResultCode = resultCode, request.Reached, request.Stopped, request.LocalizationPassed,
            request.CameraPresetConfirmed, Reason = reason, EvidenceNote = normalizedEvidence
        });
        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, $"poi-verification:{command.ProposalId:D}", cancellationToken);
        var prior = await verificationRepository.FindVerificationRequestAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior is not null)
        {
            MapPoiRequestIdempotency.EnsureSameRequest(prior.RequestHash, requestHash);
            return MapPoiReadModelMapper.ToVerificationView(prior);
        }

        var proposal = await proposalRepository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        PoiProposalRules.EnsureCurrent(proposal, command.RevisionNumber, request.ExpectedRowVersion);
        var revision = await proposalRepository.FindRevisionAsync(command.ProposalId, command.RevisionNumber, cancellationToken)
            ?? throw new NotFoundException("POI proposal revision", command.RevisionNumber);
        if (await proposalRepository.FindSubmissionAsync(revision.Id, cancellationToken) is null)
            throw new ConflictException("A POI proposal must be submitted before technical verification.");
        if (await verificationRepository.FindVerificationAsync(revision.Id, cancellationToken) is not null)
            throw new ConflictException("A technical result already exists for this immutable POI revision.");
        if (resultCode == "PASS" && !(request.Reached && request.Stopped && request.LocalizationPassed && request.CameraPresetConfirmed))
            throw new ValidationException("A passing result requires reach, stop, localization and camera-preset confirmation.");
        if (resultCode == "FAIL" && (reason is null || (request.Reached && request.Stopped && request.LocalizationPassed && request.CameraPresetConfirmed)))
            throw new ValidationException("A rejected result requires a reason and at least one failed observation.");

        var robot = await mapRepository.FindPhysicalRobotAsync(request.RobotCode.Trim(), cancellationToken)
            ?? throw new NotFoundException("Physical robot", request.RobotCode.Trim());
        await mapRepository.LockRobotDeploymentStateAsync(robot.Id, cancellationToken);
        RobotLifecycleRules.EnsureActive(robot);
        var latestDeployment = await mapRepository.GetLatestDeploymentCheckForRobotAsync(robot.Id, cancellationToken);
        var map = await mapRepository.FindMapVersionAsync(revision.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", revision.MapVersionId);
        if (!PoiProposalRules.IsDeployedOn(latestDeployment, map))
            throw new ConflictException("The exact map version must have a current successful localization/display deployment check on this robot.", "MAP_NOT_DEPLOYED");

        PoiProposalRules.ValidatePosition(map, new PoiProposalDraft(
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
            VerificationMethod = PoiVerificationMethods.ManualCheck,
        };
        verificationRepository.Add(result);
        verificationRepository.AddAuditLog(new AuditLog
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
        return MapPoiReadModelMapper.ToVerificationView(result, revision, map.MapKey, robot.RobotCode);
    }
}
