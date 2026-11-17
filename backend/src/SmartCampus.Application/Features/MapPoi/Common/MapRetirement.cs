using System.Text;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>Retirement state of a map version (ADR-0041). Retiring stops new work on it; nothing is deleted.</summary>
public static class MapRetirement
{
    public const string Active = "ACTIVE";
    public const string Retired = "RETIRED";
    public const string RetiredCode = "MAP_VERSION_RETIRED";
    public const string RetiredMessage = "Phiên bản bản đồ đã ngừng sử dụng nên không dùng được cho mục mới. Kỹ thuật có thể mở lại.";

    public static string StatusOf(MapVersion map) => map.RetiredAt is null ? Active : Retired;

    /// <summary>
    /// MapVersions has no SQL rowversion, so the retirement state is the version a client echoes back. Only these three
    /// columns can change on a stored map version, and RetiredAt alone decides between them.
    /// </summary>
    public static string RowVersionOf(DateTimeOffset? retiredAt) =>
        Convert.ToBase64String(Encoding.ASCII.GetBytes(retiredAt is null ? "active" : $"retired:{retiredAt.Value.UtcTicks}"));

    /// <summary>
    /// The guard every writer of new work calls after <see cref="IMapVersionRepository.LockMapPreparationStateAsync"/>:
    /// the read happens under the same lock retire and reopen take, so it cannot see a stale state.
    /// </summary>
    public static async Task EnsureActiveAsync(IMapVersionRepository repository, Guid mapVersionId, CancellationToken cancellationToken)
    {
        if (await repository.IsMapVersionRetiredAsync(mapVersionId, cancellationToken))
            throw new ConflictException(RetiredMessage, RetiredCode);
    }
}
