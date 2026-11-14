using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>Unlocked read of the facts ADR-0045 head control checks on every button press.</summary>
public sealed class EfTourHeadControlReader(ApplicationDbContext db) : ITourHeadControlReader
{
    public Task<TourHeadControlView?> GetAsync(Guid tourId, CancellationToken cancellationToken) =>
        db.Tours.AsNoTracking()
            .Where(tour => tour.Id == tourId)
            .Select(tour => new TourHeadControlView(tour.Id, tour.State, tour.OperatorUserId, tour.AssignedRobotId,
                db.Robots.Where(robot => robot.Id == tour.AssignedRobotId).Select(robot => robot.RobotCode).FirstOrDefault(),
                tour.TourRobotReservations.Where(hold => hold.ReleasedAt == null).Select(hold => hold.Robot.RobotCode).FirstOrDefault()))
            .SingleOrDefaultAsync(cancellationToken);
}
