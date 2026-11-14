using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// "Ngừng sử dụng" for one map version (ADR-0041). Nothing is deleted: POIs, routes, Tours and checks on the version stay
/// readable, and every writer of new work refuses it with 409 MAP_VERSION_RETIRED until it is reopened.
/// </summary>
public sealed record RetireMapVersionCommand(Guid ActorUserId, Guid MapVersionId, RetireMapVersionRequest Request)
    : IPoiMutationCommand<MapVersionView>;

/// <summary>"Mở lại" lifts only the stop; nothing else changes.</summary>
public sealed record ReopenMapVersionCommand(Guid ActorUserId, Guid MapVersionId, ReopenMapVersionRequest Request)
    : IPoiMutationCommand<MapVersionView>;

public sealed record GetMapRetirementImpactQuery(Guid MapVersionId) : IRequest<MapRetirementImpact>;

public sealed class RetireMapVersionCommandValidator : AbstractValidator<RetireMapVersionCommand>
{
    public RetireMapVersionCommandValidator()
    {
        RuleFor(command => command.ActorUserId).NotEmpty();
        RuleFor(command => command.Request.Reason).Must(reason => !string.IsNullOrWhiteSpace(reason))
            .WithMessage("Cần nhập lý do ngừng sử dụng.");
        RuleFor(command => command.Request.Reason).Must(reason => reason is null || reason.Trim().Length <= 500)
            .WithMessage("Lý do tối đa 500 ký tự.");
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class ReopenMapVersionCommandValidator : AbstractValidator<ReopenMapVersionCommand>
{
    public ReopenMapVersionCommandValidator() => RuleFor(command => command.ActorUserId).NotEmpty();
}

public static class MapRetirementCodes
{
    public const string Stale = "MAP_VERSION_STALE";
    public const string RobotAssigned = "MAP_VERSION_ROBOT_ASSIGNED";
    public const string PendingReviews = "MAP_VERSION_HAS_PENDING_REVIEWS";
    public const string UpcomingTours = "MAP_VERSION_HAS_UPCOMING_TOURS";
    public const string RetiredAudit = "MAP_VERSION_RETIRED";
    public const string ReopenedAudit = "MAP_VERSION_REOPENED";
}

public sealed class RetireMapVersionCommandHandler(IMapVersionRepository repository, TimeProvider timeProvider)
    : IRequestHandler<RetireMapVersionCommand, MapVersionView>
{
    public async Task<MapVersionView> Handle(RetireMapVersionCommand command, CancellationToken cancellationToken)
    {
        // The same lock every writer of new work on this version takes, then the row itself: a POI submit, route revision,
        // deployment check, robot assignment or Tour create either commits before this read or sees the retirement.
        await repository.LockMapPreparationStateAsync(command.MapVersionId, cancellationToken);
        var (found, retiredAt) = await repository.LockMapVersionRowAsync(command.MapVersionId, cancellationToken);
        if (!found) throw new NotFoundException("Map version", command.MapVersionId);
        if (!string.Equals(MapRetirement.RowVersionOf(retiredAt), command.Request.ExpectedRowVersion, StringComparison.Ordinal))
            throw new ConflictException("Phiên bản bản đồ vừa được người khác thay đổi. Tải lại rồi thử lại.", MapRetirementCodes.Stale);
        // Unreachable with a matching version, but keeps a retirement from being overwritten.
        if (retiredAt is not null)
            throw new ConflictException("Phiên bản bản đồ đã ngừng sử dụng.", MapRetirement.RetiredCode);

        var impact = await repository.GetMapRetirementImpactAsync(command.MapVersionId, cancellationToken);
        if (impact.AssignedRobots.Count > 0)
            throw new ConflictException(
                $"Phiên bản này đang được gán cho {string.Join(", ", impact.AssignedRobots.Select(robot => robot.RobotCode))}. Đổi hoặc bỏ gán bản đồ của robot trước.",
                MapRetirementCodes.RobotAssigned,
                blockers: impact.AssignedRobots.Select(robot => new ConflictBlocker("ROBOT", robot.RobotCode)).ToArray());
        if (impact.PendingPois.Count + impact.PendingRoutes.Count > 0)
            throw new ConflictException(
                "Còn POI hoặc tuyến đã gửi và đang chờ Kỹ thuật trên phiên bản này. Ghi kết quả cho các mục đó trước.",
                MapRetirementCodes.PendingReviews,
                blockers: impact.PendingPois.Select(poi => new ConflictBlocker("POI", $"{poi.Name} · phiên bản {poi.RevisionNumber}"))
                    .Concat(impact.PendingRoutes.Select(route => new ConflictBlocker("ROUTE", $"{route.Name} · phiên bản {route.RevisionNumber}")))
                    .ToArray());
        if (impact.UpcomingTours.Count > 0)
            throw new ConflictException(
                "Còn Tour đã lên lịch hoặc sẵn sàng dùng tuyến trên phiên bản này. Huỷ hoặc đổi tuyến các Tour đó trước.",
                MapRetirementCodes.UpcomingTours,
                blockers: impact.UpcomingTours.Select(tour => new ConflictBlocker("TOUR", tour.Name)).ToArray());

        var now = timeProvider.GetUtcNow();
        var reason = command.Request.Reason.Trim();
        await repository.SetMapVersionRetirementAsync(command.MapVersionId, now, command.ActorUserId, reason, cancellationToken);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = MapRetirementCodes.RetiredAudit,
            EntityType = "MapVersion",
            EntityId = command.MapVersionId.ToString("D"),
            ResultCode = "RETIRED",
            DataJson = JsonSerializer.Serialize(new { reason, routes = impact.Routes.Select(route => route.RouteId) }),
            OccurredAt = now
        });
        return await MapRetirementView.LoadAsync(repository, command.MapVersionId, cancellationToken);
    }
}

public sealed class ReopenMapVersionCommandHandler(IMapVersionRepository repository, TimeProvider timeProvider)
    : IRequestHandler<ReopenMapVersionCommand, MapVersionView>
{
    public async Task<MapVersionView> Handle(ReopenMapVersionCommand command, CancellationToken cancellationToken)
    {
        await repository.LockMapPreparationStateAsync(command.MapVersionId, cancellationToken);
        var (found, retiredAt) = await repository.LockMapVersionRowAsync(command.MapVersionId, cancellationToken);
        if (!found) throw new NotFoundException("Map version", command.MapVersionId);
        // Reopening an open version changes nothing, so a retry or a second person gets the same result.
        if (retiredAt is null)
            return await MapRetirementView.LoadAsync(repository, command.MapVersionId, cancellationToken);
        if (command.Request.ExpectedRowVersion is { Length: > 0 } expected &&
            !string.Equals(MapRetirement.RowVersionOf(retiredAt), expected, StringComparison.Ordinal))
            throw new ConflictException("Phiên bản bản đồ vừa được người khác thay đổi. Tải lại rồi thử lại.", MapRetirementCodes.Stale);

        var now = timeProvider.GetUtcNow();
        await repository.SetMapVersionRetirementAsync(command.MapVersionId, null, null, null, cancellationToken);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = MapRetirementCodes.ReopenedAudit,
            EntityType = "MapVersion",
            EntityId = command.MapVersionId.ToString("D"),
            ResultCode = "REOPENED",
            DataJson = JsonSerializer.Serialize(new { retiredAt }),
            OccurredAt = now
        });
        return await MapRetirementView.LoadAsync(repository, command.MapVersionId, cancellationToken);
    }
}

public sealed class GetMapRetirementImpactQueryHandler(IMapVersionRepository repository)
    : IRequestHandler<GetMapRetirementImpactQuery, MapRetirementImpact>
{
    public async Task<MapRetirementImpact> Handle(GetMapRetirementImpactQuery query, CancellationToken cancellationToken)
    {
        if (await repository.FindMapVersionAsync(query.MapVersionId, includePackage: false, cancellationToken) is null)
            throw new NotFoundException("Map version", query.MapVersionId);
        return await repository.GetMapRetirementImpactAsync(query.MapVersionId, cancellationToken);
    }
}

internal static class MapRetirementView
{
    /// <summary>Reads the version again after the column update, which bypasses the change tracker.</summary>
    public static async Task<MapVersionView> LoadAsync(IMapVersionRepository repository, Guid mapVersionId, CancellationToken cancellationToken)
    {
        var map = await repository.FindMapVersionAsync(mapVersionId, includePackage: false, cancellationToken)
            ?? throw new NotFoundException("Map version", mapVersionId);
        return MapPoiReadModelMapper.ToMapView(map, map.AreaKeyNavigation.DisplayName);
    }
}
