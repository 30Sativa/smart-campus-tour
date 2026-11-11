using System.Globalization;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// What the robot's PAN/TILT head (the Quest 3 VR camera) does when a Tour arrives at the POI (FR-49, ADR-0045
/// addendum 10/11/2026). One value per POI revision, stored in the existing <c>CameraPreset</c> column and copied into
/// route revision stops, so no schema change. Input is case-insensitive; stored values are canonical:
/// <list type="bullet">
/// <item><c>FRONT</c>, <c>LEFT</c>, <c>RIGHT</c>: turn to 0°, +90° (left) or −90° (right), TILT level.</item>
/// <item><c>ANGLE:pan,tilt</c>: a custom angle, pan −170..170 (positive = left), tilt −18..18 (positive = up),
/// at most one decimal.</item>
/// <item><c>SWEEP</c> or <c>SWEEP:deg</c>: turn left, right, then back, <c>deg</c> 10..170 per side (bare = the
/// robot's default, 135°).</item>
/// <item><c>NONE</c>: the head does not move by itself; only the Operator's buttons turn it.</item>
/// </list>
/// The limits are the firmware soft limits (head_core.h). Older revisions may hold other values.
/// </summary>
public static class PoiCameraPresets
{
    public const string Front = "FRONT";
    public const string Left = "LEFT";
    public const string Right = "RIGHT";
    public const string None = "NONE";
    public const string Sweep = "SWEEP";
    public const string Angle = "ANGLE";

    public const double SideDeg = 90;
    public const double MaximumPanDeg = 170;
    public const double MaximumTiltDeg = 18;
    public const int MinimumSweepDeg = 10;
    public const int MaximumSweepDeg = 170;

    public const string InvalidMessage =
        "Hoạt động đầu camera chỉ được là Phía trước, Bên trái, Bên phải, Không tự xoay, Quét trái rồi phải " +
        "(10 đến 170 độ mỗi bên) hoặc Góc tùy chỉnh (PAN -170 đến 170 độ, TILT -18 đến 18 độ).";

    public static bool IsValid(string? value) => Parse(value) is not null;

    /// <summary>The canonical stored form, or null when the value is not a valid preset.</summary>
    public static string? Normalize(string? value) => Parse(value)?.ToString();

    public static PoiCameraAction? Parse(string? value)
    {
        var text = value?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(text))
            return null;
        switch (text)
        {
            case Front: return new(Front, 0, 0, null);
            case Left: return new(Left, SideDeg, 0, null);
            case Right: return new(Right, -SideDeg, 0, null);
            case None: return new(None, null, null, null);
            case Sweep: return new(Sweep, null, null, null);
        }
        if (text.StartsWith(Sweep + ":", StringComparison.Ordinal))
        {
            var degrees = text[(Sweep.Length + 1)..];
            return degrees.All(char.IsAsciiDigit) && degrees.Length is > 0 and <= 3 &&
                   int.TryParse(degrees, NumberStyles.None, CultureInfo.InvariantCulture, out var sweep) &&
                   sweep is >= MinimumSweepDeg and <= MaximumSweepDeg
                ? new(Sweep, null, null, sweep)
                : null;
        }
        if (text.StartsWith(Angle + ":", StringComparison.Ordinal))
        {
            var parts = text[(Angle.Length + 1)..].Split(',');
            return parts.Length == 2 && Degrees(parts[0], MaximumPanDeg) is { } pan && Degrees(parts[1], MaximumTiltDeg) is { } tilt
                ? new(Angle, pan, tilt, null)
                : null;
        }
        return null;
    }

    /// <summary>A plain decimal with at most one digit after the point, within ±limit.</summary>
    private static double? Degrees(string text, double limit)
    {
        var plain = text.TrimStart('-');
        if (plain.Length is 0 or > 5 || plain.Count(c => c == '.') > 1 || !plain.All(c => char.IsAsciiDigit(c) || c == '.') ||
            plain.StartsWith('.') || plain.EndsWith('.') || plain.Contains('.') && plain.Length - plain.IndexOf('.') > 2 ||
            text.LastIndexOf('-') > 0)
            return null;
        var value = double.Parse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
        return Math.Abs(value) <= limit ? value + 0.0 : null;
    }
}

/// <summary>
/// A parsed POI camera preset. <see cref="PanDeg"/>/<see cref="TiltDeg"/> are set for a fixed angle (FRONT, LEFT,
/// RIGHT, ANGLE); <see cref="SweepDeg"/> only for a SWEEP with its own amplitude; NONE has nothing.
/// </summary>
public sealed record PoiCameraAction(string Kind, double? PanDeg, double? TiltDeg, int? SweepDeg)
{
    public override string ToString() => Kind switch
    {
        PoiCameraPresets.Angle => $"{PoiCameraPresets.Angle}:{Format(PanDeg!.Value)},{Format(TiltDeg!.Value)}",
        PoiCameraPresets.Sweep when SweepDeg is { } sweep => $"{PoiCameraPresets.Sweep}:{sweep.ToString(CultureInfo.InvariantCulture)}",
        _ => Kind
    };

    // "0.#" never prints "-0": a negative zero is normalized to 0 when parsed (value + 0.0).
    private static string Format(double value) => (value == 0 ? 0 : value).ToString("0.#", CultureInfo.InvariantCulture);
}
