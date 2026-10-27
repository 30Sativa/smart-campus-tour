using System.Security.Cryptography;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

internal static class MapPoiRequestIdempotency
{
    public static void EnsureSameRequest(byte[] storedHash, byte[] requestHash)
    {
        if (!CryptographicOperations.FixedTimeEquals(storedHash, requestHash))
            throw new ConflictException("This request ID was already used with different content.", "IDEMPOTENCY_CONFLICT");
    }
}
