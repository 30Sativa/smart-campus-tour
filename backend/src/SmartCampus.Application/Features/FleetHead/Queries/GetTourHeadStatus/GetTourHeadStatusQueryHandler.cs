using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetHead.Queries.GetTourHeadStatus;

public sealed class GetTourHeadStatusQueryHandler(ITourHeadControlReader tours, IHeadCommandChannel channel, FleetHeadSettings settings)
    : IRequestHandler<GetTourHeadStatusQuery, TourHeadStatus>
{
    public async Task<TourHeadStatus> Handle(GetTourHeadStatusQuery query, CancellationToken ct)
    {
        var tour = await tours.GetAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (string.IsNullOrEmpty(tour.RobotCode))
            return new TourHeadStatus(settings.Enabled, null, false, null, null, null);
        var status = channel.GetStatus(tour.RobotCode);
        return new TourHeadStatus(settings.Enabled, tour.RobotCode, status.Connected, status.LastPollAt, status.Head,
            status.HeadReceivedAt);
    }
}
