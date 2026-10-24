using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Registrations;

/// <summary>Opaque base64 SQL rowversion tokens checked by every registration-family writer.</summary>
public static class RowVersionToken
{
    public const string StaleCode = "STALE_VERSION";

    public static bool IsValid(string? value)
    {
        Span<byte> bytes = stackalloc byte[8];
        return value is not null && Convert.TryFromBase64String(value, bytes, out var length) && length == 8;
    }

    public static string Encode(byte[] rowVersion) => Convert.ToBase64String(rowVersion);

    /// <summary>Rejects a write whose locked row no longer has the version the client opened.</summary>
    public static void EnsureCurrent(byte[] current, string expected)
    {
        if (!current.AsSpan().SequenceEqual(Convert.FromBase64String(expected)))
            throw new ConflictException("Dữ liệu đã thay đổi. Tải lại trước khi tiếp tục.", StaleCode);
    }
}
