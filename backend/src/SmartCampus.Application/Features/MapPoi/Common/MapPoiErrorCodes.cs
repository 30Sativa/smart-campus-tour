namespace SmartCampus.Application.Features.MapPoi;

/// <summary>Validation failures carrying one of these codes are answered with 422 and their own message.</summary>
public static class MapPoiErrorCodes
{
    public const string CameraPresetInvalid = "POI_CAMERA_PRESET_INVALID";
    public const string PoseClearanceInsufficient = "POSE_CLEARANCE_INSUFFICIENT";
}
