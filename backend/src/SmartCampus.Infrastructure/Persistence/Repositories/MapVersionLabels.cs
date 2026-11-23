using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>
/// The map fields the readiness rule and its sentences read (ADR-0066), without the package bytes. Only attach the result
/// to untracked entities: a tracked owner would treat it as a new row.
/// </summary>
internal static class MapVersionLabels
{
    public static async Task<IReadOnlyDictionary<Guid, MapVersion>> LoadAsync(ApplicationDbContext db,
        IReadOnlyCollection<Guid> ids, CancellationToken ct) => ids.Count == 0 ? new Dictionary<Guid, MapVersion>()
        : await db.MapVersions.AsNoTracking().Where(map => ids.Contains(map.Id)).Select(map => new MapVersion
        {
            Id = map.Id, AreaKey = map.AreaKey, VersionNumber = map.VersionNumber, MapKey = map.MapKey, FrameId = map.FrameId,
            PackageSha256 = map.PackageSha256, RetiredAt = map.RetiredAt,
            AreaKeyNavigation = new MapArea { AreaKey = map.AreaKeyNavigation.AreaKey, DisplayName = map.AreaKeyNavigation.DisplayName }
        }).ToDictionaryAsync(map => map.Id, ct);

    public static async Task<Robot?> WithAssignedMapAsync(ApplicationDbContext db, Robot? robot, CancellationToken ct)
    {
        if (robot?.AssignedMapVersionId is { } id)
            robot.AssignedMapVersion = (await LoadAsync(db, [id], ct)).GetValueOrDefault(id);
        return robot;
    }

    public static async Task<IReadOnlyList<Robot>> WithAssignedMapsAsync(ApplicationDbContext db, IReadOnlyList<Robot> robots, CancellationToken ct)
    {
        var maps = await LoadAsync(db, robots.Where(r => r.AssignedMapVersionId is not null).Select(r => r.AssignedMapVersionId!.Value).Distinct().ToArray(), ct);
        foreach (var robot in robots)
            if (robot.AssignedMapVersionId is { } id) robot.AssignedMapVersion = maps.GetValueOrDefault(id);
        return robots;
    }

    public static async Task<MapDeploymentCheck?> WithMapAsync(ApplicationDbContext db, MapDeploymentCheck? check, CancellationToken ct)
    {
        if (check is not null) check.MapVersion = (await LoadAsync(db, [check.MapVersionId], ct))[check.MapVersionId];
        return check;
    }
}
