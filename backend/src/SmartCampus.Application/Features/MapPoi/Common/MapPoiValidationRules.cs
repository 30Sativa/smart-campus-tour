using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

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
        rules.Must(draft => !string.IsNullOrWhiteSpace(draft.NarrationText) && draft.NarrationText.Trim().Length <= 4000)
            .WithMessage("POI narration is required and must not exceed 4000 characters.");
        rules.Must(draft => draft.FallbackVideoUrl is null || draft.FallbackVideoUrl.Trim().Length <= 2048)
            .WithMessage("POI fallback video URL must not exceed 2048 characters.");
        rules.Must(draft => string.IsNullOrWhiteSpace(draft.FallbackVideoUrl) ||
                            Uri.TryCreate(draft.FallbackVideoUrl.Trim(), UriKind.Absolute, out var uri) &&
                            uri.Scheme == Uri.UriSchemeHttps && string.IsNullOrEmpty(uri.UserInfo))
            .WithMessage("POI fallback video URL must be an HTTPS URL.");
        rules.Must(draft => PoiCameraPresets.IsValid(draft.CameraPreset))
            .WithMessage(PoiCameraPresets.InvalidMessage)
            .WithErrorCode(MapPoiErrorCodes.CameraPresetInvalid);
    }

    public static PoiProposalDraft Normalize(PoiProposalDraft draft) => draft with
    {
        Name = draft.Name.Trim(), Purpose = draft.Purpose.Trim(),
        Description = string.IsNullOrWhiteSpace(draft.Description) ? null : draft.Description.Trim(),
        CameraPreset = PoiCameraPresets.Normalize(draft.CameraPreset) ?? draft.CameraPreset.Trim().ToUpperInvariant(),
        NarrationText = string.IsNullOrWhiteSpace(draft.NarrationText) ? null : draft.NarrationText.Trim(),
        FallbackVideoUrl = string.IsNullOrWhiteSpace(draft.FallbackVideoUrl) ? null : draft.FallbackVideoUrl.Trim()
    };
}
