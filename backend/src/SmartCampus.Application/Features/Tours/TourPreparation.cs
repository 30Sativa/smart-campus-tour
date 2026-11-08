using FluentValidation;
using FluentValidation.Results;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

internal static class TourPreparation
{
    public static TourInput Normalize(TourInput input) => input with
    {
        Name = input.Name.Trim(), Description = Optional(input.Description),
        FallbackVideoUrl = Optional(input.FallbackVideoUrl), ScheduledStartAt = input.ScheduledStartAt.ToUniversalTime()
    };

    public static CreateTourInput Normalize(CreateTourInput input) => input with
    {
        Name = input.Name.Trim(), Description = Optional(input.Description), RobotCode = input.RobotCode.Trim(),
        FallbackVideoUrl = Optional(input.FallbackVideoUrl), ScheduledStartAt = input.ScheduledStartAt.ToUniversalTime()
    };

    private static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static void RequireFuture(DateTimeOffset schedule, DateTimeOffset now)
    {
        if (schedule <= now)
            throw new ValidationException([new ValidationFailure("Configuration.ScheduledStartAt", "Lịch Tour mới phải ở tương lai.")]);
    }

    public static void RequireConfiguredDuration()
    {
        throw new ConflictException(
            "Không thể lập lịch Tour cho đến khi có nguồn tổng thời lượng cấu hình được phê duyệt cho đúng phiên bản Route. Thời lượng đo từ lần thử điều hướng không thay thế nguồn này.",
            "TOUR_DURATION_UNAVAILABLE");
    }

    public static TourPermissions Permissions(Tour tour, TourUsage usage)
    {
        var noOperationalUse = !usage.HasOperationalHistory && !usage.HasRobotOwnership;
        var edit = tour.CanEditPreparation && noOperationalUse;
        var beforeStart = tour.CanCancelBeforeStart && noOperationalUse;
        return new(edit, edit && !usage.LocksScheduleAndRoute, beforeStart)
        {
            CanChangeCapacity = beforeStart,
            CanChangeOperator = beforeStart && tour.RouteRevisionId is not null
        };
    }

    public static async Task SelectRouteAsync(IRouteManagementRepository routes, Guid id, string expectedVersion, CancellationToken ct)
    {
        var route = await routes.FindForTourSelectionAsync(id, ct) ?? throw new NotFoundException("Không tìm thấy Route.");
        LegacyRouteRevision.EnsureCurrent(route, expectedVersion);
        if (!route.IsActive) throw new ConflictException("Route không còn khả dụng cho Tour mới.", "ROUTE_UNAVAILABLE");
        RouteConfiguration.EnsureValid(route, true);
    }
}
