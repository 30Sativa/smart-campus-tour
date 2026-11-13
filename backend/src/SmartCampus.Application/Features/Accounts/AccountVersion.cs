using System.Buffers.Binary;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Accounts;

/// <summary>
/// Opaque account version for writers that need optimistic concurrency (ADR-0058). dbo.Users has no SQL
/// rowversion, so the token is the 8-byte big-endian UTC ticks of the stored <c>UpdatedAt ?? CreatedAt</c>,
/// in the same base64 shape as <see cref="RowVersionToken"/>. Every User writer sets UpdatedAt.
/// </summary>
public static class AccountVersion
{
    public static string Encode(DateTimeOffset createdAt, DateTimeOffset? updatedAt) =>
        RowVersionToken.Encode(Bytes(updatedAt ?? createdAt));

    public static bool IsValid(string? value) => RowVersionToken.IsValid(value);

    /// <summary>Rejects the write with 409 STALE_VERSION when the locked row is no longer the version the client opened.</summary>
    public static void EnsureCurrent(DateTimeOffset createdAt, DateTimeOffset? updatedAt, string expected) =>
        RowVersionToken.EnsureCurrent(Bytes(updatedAt ?? createdAt), expected);

    /// <summary>
    /// A new UpdatedAt that SQL DATETIMEOFFSET(3) stores exactly and that is strictly later than the previous
    /// value, so the version always changes after this write.
    /// </summary>
    public static DateTimeOffset NextStamp(DateTimeOffset now, DateTimeOffset createdAt, DateTimeOffset? updatedAt)
    {
        var truncated = Truncate(now);
        var previous = Truncate(updatedAt ?? createdAt);
        return truncated > previous ? truncated : previous.AddMilliseconds(1);
    }

    private static DateTimeOffset Truncate(DateTimeOffset value)
    {
        var utc = value.ToUniversalTime();
        return new DateTimeOffset(utc.UtcTicks - utc.UtcTicks % TimeSpan.TicksPerMillisecond, TimeSpan.Zero);
    }

    private static byte[] Bytes(DateTimeOffset value)
    {
        var bytes = new byte[8];
        BinaryPrimitives.WriteInt64BigEndian(bytes, Truncate(value).UtcTicks);
        return bytes;
    }
}
