using System.Security.Cryptography;
using System.Text.Json;

namespace SmartCampus.Application.Features.MapPoi;

internal static class MapPoiRequestHash
{
    public static byte[] Compute<T>(T request) => SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request));
}
