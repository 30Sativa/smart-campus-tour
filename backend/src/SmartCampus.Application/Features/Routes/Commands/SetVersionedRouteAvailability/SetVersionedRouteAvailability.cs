using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public sealed record SetVersionedRouteAvailabilityCommand(Guid ActorUserId, Guid RouteId, bool IsActive, RouteAvailabilityRequest Request)
    : IRouteMutationCommand<RouteAvailabilityResult>;

public sealed class SetVersionedRouteAvailabilityValidator : AbstractValidator<SetVersionedRouteAvailabilityCommand>
{
    public SetVersionedRouteAvailabilityValidator()
    {
        RuleFor(c => c.RouteId).NotEmpty();
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(LegacyRouteRevision.IsValid);
        });
    }
}

/// <summary>Flips the flag only: revisions, test runs and existing Tours are untouched (ADR-0037).</summary>
public sealed class SetVersionedRouteAvailabilityHandler(IRouteRevisionRepository repo, TimeProvider clock)
    : IRequestHandler<SetVersionedRouteAvailabilityCommand, RouteAvailabilityResult>
{
    public async Task<RouteAvailabilityResult> Handle(SetVersionedRouteAvailabilityCommand c, CancellationToken ct)
    {
        var action = c.IsActive ? "ROUTE_ACTIVATED" : "ROUTE_DEACTIVATED";
        await repo.LockRequestAsync(c.ActorUserId, c.Request.RequestId, "availability", ct);
        var prior = await repo.FindAvailabilityRequestAsync(c.ActorUserId, c.Request.RequestId, ct);
        if (prior is not null)
        {
            if (prior.Action != action || prior.EntityId != c.RouteId.ToString("D"))
                throw new ConflictException("Mã yêu cầu đã được dùng cho thao tác tuyến khác.", "IDEMPOTENCY_CONFLICT");
            return new(c.RouteId, c.IsActive, await repo.ListScheduledToursAsync(c.RouteId, ct));
        }
        var route = await repo.LockRouteAsync(c.RouteId, ct) ?? throw new NotFoundException("Không tìm thấy tuyến.");
        if (!string.Equals(LegacyRouteRevision.For(route), c.Request.ExpectedRowVersion, StringComparison.Ordinal))
            throw new ConflictException("Tuyến vừa được thay đổi. Tải lại danh sách rồi thử lại.", "STALE_ROUTE");
        var tours = await repo.ListScheduledToursAsync(route.Id, ct);
        if (route.IsOpenForNewTours == c.IsActive) return new(route.Id, c.IsActive, tours);
        var now = clock.GetUtcNow();
        route.IsActive = c.IsActive;
        route.UpdatedAt = now;
        repo.AddAudit(new AuditLog
        {
            ActorUserId = c.ActorUserId, CorrelationId = c.Request.RequestId, EntityType = "Route", EntityId = route.Id.ToString("D"),
            Action = action, ResultCode = "SUCCESS", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { routeId = route.Id, affectedTourCount = tours.Count })
        });
        return new(route.Id, c.IsActive, tours);
    }
}
