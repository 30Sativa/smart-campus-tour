using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace SmartCampus.Application.Features.MapPoi;

internal static class PoiNavigationFingerprint
{
    public static byte[] Compute(PoiProposalDraft draft)
    {
        var canonical = string.Join('\n',
            draft.MapVersionId.ToString("D"),
            draft.X.ToString("0.0000", CultureInfo.InvariantCulture),
            draft.Y.ToString("0.0000", CultureInfo.InvariantCulture),
            draft.Yaw.ToString("0.000000", CultureInfo.InvariantCulture),
            draft.CameraPreset.Trim().ToUpperInvariant());
        return SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
    }
}
