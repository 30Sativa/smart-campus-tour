using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetHead.Queries.GetTourHeadStatus;

public sealed class GetTourHeadStatusQueryHandler(ITourHeadControlReader tours, IHeadCommandChannel channel, ITourHeadModeStore modes,
    FleetHeadSettings settings)
    : IRequestHandler<GetTourHeadStatusQuery, TourHeadStatus>
{
    public async Task<TourHeadStatus> Handle(GetTourHeadStatusQuery query, CancellationToken ct)
    {
        var tour = await tours.GetAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var mode = modes.GetMode(tour.TourId);
        if (string.IsNullOrEmpty(tour.RobotCode))
            return new TourHeadStatus(settings.Enabled, mode, null, false, null, null, null);
        var status = channel.GetStatus(tour.RobotCode);
        return new TourHeadStatus(settings.Enabled, mode, tour.RobotCode, status.Connected, status.LastPollAt, status.Head,
            status.HeadReceivedAt);
    }
}
