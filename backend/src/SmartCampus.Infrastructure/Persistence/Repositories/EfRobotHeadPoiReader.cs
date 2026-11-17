using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetHead.Queries.GetRobotHeadPois;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>Unlocked read for the robot-side POI head (ADR-0045 addendum 14/11/2026); see <see cref="IRobotHeadPoiReader"/>.</summary>
public sealed class EfRobotHeadPoiReader(ApplicationDbContext db) : IRobotHeadPoiReader
{
    public async Task<RobotHeadPoiSet?> GetAsync(string robotCode, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking()
            .Where(item => item.RobotCode == robotCode && item.DeactivatedAt == null)
            .Select(item => new { item.Id, item.AssignedMapVersionId })
            .SingleOrDefaultAsync(cancellationToken);
        if (robot is null)
            return null;

        var tour = await db.Tours.AsNoTracking()
            .Where(item => item.AssignedRobotId == robot.Id && item.State == TourRuntime.Running && item.RouteRevisionId != null)
            .Select(item => new { item.Id, item.RouteRevisionId })
            .FirstOrDefaultAsync(cancellationToken);
        if (tour is not null)
        {
            var stops = await db.RouteRevisionStops.AsNoTracking()
                .Where(stop => stop.RouteRevisionId == tour.RouteRevisionId)
                .OrderBy(stop => stop.StopOrder)
                .Select(stop => new { stop.Id, stop.Name, stop.X, stop.Y, stop.Yaw, stop.CameraPreset, stop.MapVersionId })
                .ToListAsync(cancellationToken);
            return new RobotHeadPoiSet(RobotHeadPoiSources.Tour, tour.Id, stops.FirstOrDefault()?.MapVersionId,
                stops.Select(stop => new RobotHeadPoiView(stop.Id, stop.Name, stop.X, stop.Y, stop.Yaw, stop.CameraPreset)).ToArray());
        }

        if (robot.AssignedMapVersionId is not { } mapVersionId)
            return new RobotHeadPoiSet(RobotHeadPoiSources.None, null, null, []);

        // Every POI on the robot's map: its latest revision that passed verification (a newer draft or FAIL does not count).
        var passed = await db.PoiVerificationRecords.AsNoTracking()
            .Where(record => record.MapVersionId == mapVersionId && record.ResultCode == "PASS" &&
                             record.ProposalRevision.Proposal.DiscardedAt == null)
            .Select(record => new
            {
                record.ProposalRevision.ProposalId,
                record.ProposalRevision.RevisionNumber,
                record.ProposalRevision.Name,
                record.ProposalRevision.X,
                record.ProposalRevision.Y,
                record.ProposalRevision.Yaw,
                record.ProposalRevision.CameraPreset
            })
            .ToListAsync(cancellationToken);
        var pois = passed
            .GroupBy(item => item.ProposalId)
            .Select(group => group.MaxBy(item => item.RevisionNumber)!)
            .OrderBy(item => item.Name, StringComparer.CurrentCulture)
            .Select(item => new RobotHeadPoiView(item.ProposalId, item.Name, item.X, item.Y, item.Yaw, item.CameraPreset))
            .ToArray();
        return new RobotHeadPoiSet(RobotHeadPoiSources.Map, null, mapVersionId, pois);
    }
}
