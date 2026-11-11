using SmartCampus.Application.Features.StaffNotifications;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Newest audit rows of the given actions, as Staff notifications; it never returns DataJson.</summary>
public interface IStaffNotificationReader
{
    Task<IReadOnlyList<StaffNotification>> ListLatestAsync(IReadOnlyList<string> actions, int size, CancellationToken ct);
}
