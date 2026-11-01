namespace SmartCampus.Application.Features.MapPoi;

/// <summary>Input is case-insensitive; stored values are upper case. Older revisions may hold other values.</summary>
public static class PoiCameraPresets
{
    public const string Front = "FRONT";
    public const string InvalidMessage = "Hướng camera chỉ được là Phía trước, Bên trái hoặc Bên phải.";

    public static bool IsValid(string? value) =>
        value?.Trim().ToUpperInvariant() is Front or "LEFT" or "RIGHT";
}
