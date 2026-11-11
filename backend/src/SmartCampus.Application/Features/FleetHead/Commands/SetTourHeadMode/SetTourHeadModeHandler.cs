using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.FleetHead.Commands.SetTourHeadMode;

/// <summary>
/// The Tour's Operator picks how the head behaves at POIs: AUTO sweeps on every arrival, MANUAL waits for buttons.
/// Allowed until the Tour ends, so it can be chosen before Start. Buttons work in both modes.
/// </summary>
public sealed class SetTourHeadModeHandler(ITourHeadControlReader tours, ITourHeadModeStore modes)
    : IRequestHandler<SetTourHeadMode, TourHeadModeResult>
{
    public async Task<TourHeadModeResult> Handle(SetTourHeadMode command, CancellationToken ct)
    {
        var tour = await tours.GetAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới đổi được chế độ đầu quay.");
        if (tour.State is TourRuntime.Completed or TourRuntime.Cancelled)
            throw new ConflictException("Tour đã kết thúc.", "TOUR_STATE_INVALID");
        modes.SetMode(tour.TourId, command.Mode);
        return new TourHeadModeResult(tour.TourId, command.Mode);
    }
}
