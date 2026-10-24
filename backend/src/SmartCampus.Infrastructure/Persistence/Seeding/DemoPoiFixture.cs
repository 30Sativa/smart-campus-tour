using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Seeding;

internal static class DemoPoiFixture
{
    internal const string MapKey = "demo-poi-baseline-v1";
    internal const string MapFrame = "map";

    // Stable fixture identities survive pose/content updates and RouteStop references.
    // Coordinates only illustrate the existing FE demo; they are not surveyed poses.
    internal static Poi[] Create(DateTimeOffset createdAt) =>
    [
        CreatePoi("8fd832a5-7e3b-4e6d-a101-000000000001", "[DEMO] AI Lab", -1.5m, -5.5m, createdAt),
        CreatePoi("8fd832a5-7e3b-4e6d-a101-000000000002", "[DEMO] Thư viện trung tâm", 4.8m, -2.2m, createdAt),
        CreatePoi("8fd832a5-7e3b-4e6d-a101-000000000003", "[DEMO] Innovation Space", 3.5m, 4.2m, createdAt),
        CreatePoi("8fd832a5-7e3b-4e6d-a101-000000000004", "[DEMO] Hội trường A", -3.5m, 3.8m, createdAt)
    ];

    private static Poi CreatePoi(string id, string name, decimal x, decimal y, DateTimeOffset createdAt) => new()
    {
        Id = Guid.Parse(id),
        Name = name,
        Description = "POI demo để phát triển Route/Tour. Tọa độ và hướng chưa khảo sát; không dùng để điều hướng robot thật.",
        MapKey = MapKey,
        MapFrame = MapFrame,
        X = x,
        Y = y,
        Yaw = 0m,
        IsActive = true,
        CreatedAt = createdAt
    };
}
