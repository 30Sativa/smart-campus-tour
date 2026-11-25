namespace SmartCampus.Application.Features.StaffNotifications;

/// <summary>
/// A command whose success may append one of the <see cref="StaffNotificationActions"/> audit rows: Technical Staff
/// decided on something Staff prepared or depends on. After it commits, the Staff bells are told to re-read
/// (<c>StaffNotificationsUpdated</c> on <c>/hubs/operations</c>). A command that writes a new Staff notification
/// action must carry this marker; <c>StaffNoticeSignalTests</c> holds the list.
/// </summary>
public interface IStaffNoticeCommand
{
}

/// <summary>
/// Told after a <see cref="IStaffNoticeCommand"/> has committed. A hint only, like <c>TourUpdated</c>: no payload,
/// may be coalesced or lost, and the notifications API stays the source of truth.
/// </summary>
public interface IStaffNoticeNotifier
{
    void StaffNoticesChanged();
}

/// <summary>The default when no realtime channel is hosted (tests, tools): nothing is told, the bell keeps polling.</summary>
public sealed class NoStaffNoticeNotifier : IStaffNoticeNotifier
{
    public void StaffNoticesChanged() { }
}
