using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

internal static class PoiProposalReadModelLoader
{
    public static PoiRevisionView ToRevisionView(PoiProposalRevision revision, PoiProposalSubmission? submission,
        PoiVerificationRecord? verification) => new(revision.Id, revision.RevisionNumber, revision.MapVersionId,
        revision.MapVersion.MapKey, revision.Name, revision.Purpose, revision.Description, revision.X, revision.Y,
        revision.Yaw, revision.CameraPreset, Convert.ToHexString(revision.NavigationFingerprint).ToLowerInvariant(),
        revision.CreatedByUserId, revision.CreatedAt, submission is not null, submission?.SubmittedAt,
        verification?.ResultCode ?? "NOT_CHECKED", revision.NarrationText, revision.FallbackVideoUrl,
        verification?.ProposalRevisionId);

    public static async Task<PoiProposalView> LoadAsync(
        IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository,
        PoiProposal proposal, PoiProposalRevision revision,
        CancellationToken cancellationToken)
    {
        var submitted = await proposalRepository.FindSubmissionAsync(revision.Id, cancellationToken);
        var verification = await verificationRepository.FindLatestVerificationByFingerprintAsync(
            proposal.Id, revision.NavigationFingerprint, cancellationToken);
        var view = new PoiRevisionView(revision.Id, revision.RevisionNumber, revision.MapVersionId,
            revision.MapVersion.MapKey, revision.Name, revision.Purpose, revision.Description,
            revision.X, revision.Y, revision.Yaw, revision.CameraPreset,
            Convert.ToHexString(revision.NavigationFingerprint).ToLowerInvariant(), revision.CreatedByUserId,
            revision.CreatedAt, submitted is not null, submitted?.SubmittedAt,
            verification?.ResultCode ?? "NOT_CHECKED", revision.NarrationText, revision.FallbackVideoUrl,
            verification?.ProposalRevisionId);
        return new PoiProposalView(proposal.Id, proposal.CurrentRevision,
            Convert.ToBase64String(proposal.RowVersion), proposal.CreatedAt, proposal.UpdatedAt, view);
    }
}
