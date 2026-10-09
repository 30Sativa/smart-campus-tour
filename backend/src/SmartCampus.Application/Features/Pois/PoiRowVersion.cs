namespace SmartCampus.Application.Features.Pois;

public static class PoiRowVersion
{
    public static bool IsValid(string? encoded)
    {
        if (string.IsNullOrWhiteSpace(encoded))
            return false;

        Span<byte> bytes = stackalloc byte[8];
        return Convert.TryFromBase64String(encoded, bytes, out var written) && written == bytes.Length;
    }

    public static byte[] Decode(string encoded)
    {
        var bytes = Convert.FromBase64String(encoded);
        if (bytes.Length != 8)
            throw new ArgumentException("A SQL Server row version must contain 8 bytes.", nameof(encoded));
        return bytes;
    }
}
