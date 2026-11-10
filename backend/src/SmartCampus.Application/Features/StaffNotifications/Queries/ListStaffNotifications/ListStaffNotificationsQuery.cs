using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.StaffNotifications;

/// <summary>
/// One Technical Staff outcome that Staff acts on, read from the append-only audit log. <see cref="Action"/> is the
/// audit action code (the web translates it); <see cref="TargetId"/> is what Staff opens: the POI proposal, the Route,
/// the map version or the robot. <see cref="Subject"/> is that item's name at the time of reading; null when it is gone.
/// </summary>
public sealed record StaffNotification(long Id, DateTimeOffset OccurredAt, string Action, string? ResultCode,
    Guid? TargetId, string? Subject, int? RevisionNumber, string? RobotCode, string? ActorName);

public sealed record ListStaffNotificationsQuery(int Size) : IQuery<IReadOnlyList<StaffNotification>>;

/// <summary>
/// The audit actions that are Staff's news: Technical Staff decided on something Staff prepared or depends on.
/// Raw <c>DataJson</c> is never read. Adding an action here is a public contract change (docs/architecture.md).
/// </summary>
public static class StaffNotificationActions
{
    public const string PoiVerified = "POI_TECHNICAL_VERIFIED";
    public const string PoiRejected = "POI_TECHNICAL_REJECTED";
    public const string PoiPoseCaptureVerified = "POI_POSE_CAPTURE_VERIFIED";
    public const string RouteTestPassed = "ROUTE_TEST_PASSED";
    public const string RouteTestFailed = "ROUTE_TEST_FAILED";
    public const string MapDeploymentChecked = "MAP_DEPLOYMENT_CHECK_RECORDED";
    public const string RobotInspectionReleased = "ROBOT_INSPECTION_RELEASED";

    public static readonly IReadOnlyList<string> All =
        [PoiVerified, PoiRejected, PoiPoseCaptureVerified, RouteTestPassed, RouteTestFailed, MapDeploymentChecked, RobotInspectionReleased];
}

public sealed class ListStaffNotificationsQueryValidator : AbstractValidator<ListStaffNotificationsQuery>
{
    public const int MaxSize = 50;

    public ListStaffNotificationsQueryValidator() => RuleFor(query => query.Size).InclusiveBetween(1, MaxSize);
}

public sealed class ListStaffNotificationsQueryHandler(IStaffNotificationReader reader)
    : IRequestHandler<ListStaffNotificationsQuery, IReadOnlyList<StaffNotification>>
{
    public Task<IReadOnlyList<StaffNotification>> Handle(ListStaffNotificationsQuery query, CancellationToken ct) =>
        reader.ListLatestAsync(StaffNotificationActions.All, query.Size, ct);
}
