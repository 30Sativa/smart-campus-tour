using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Routes;
using SmartCampus.Application.Routes.DTOs;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Routes
{
    public class RouteService : IRouteService
    {
        private readonly ApplicationDbContext _context;

        public RouteService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<RouteDto>> GetPublishedRoutesAsync()
        {
            return await _context.Routes
                .Where(r => r.Status == RouteStatus.Published)
                .Include(r => r.Waypoints.OrderBy(w => w.Order))
                .ThenInclude(w => w.POI)
                .Select(r => MapToDto(r))
                .ToListAsync();
        }

        public async Task<RouteDto?> GetRouteByIdAsync(Guid id)
        {
            var route = await _context.Routes
                .Include(r => r.Waypoints.OrderBy(w => w.Order))
                .ThenInclude(w => w.POI)
                .FirstOrDefaultAsync(r => r.Id == id && r.Status == RouteStatus.Published);

            return route == null ? null : MapToDto(route);
        }

        public async Task<List<TimeSlotDto>> GetAvailableSlotsAsync(Guid routeId, DateTime? from = null)
        {
            var cutoff = from ?? DateTime.UtcNow;

            var slots = await _context.TimeSlots
                .Include(s => s.Route)
                .Include(s => s.Bookings)
                .Where(s => s.RouteId == routeId
                         && s.Status == SlotStatus.Open
                         && s.StartTime > cutoff)
                .OrderBy(s => s.StartTime)
                .ToListAsync();

            return slots
                .Where(s => !s.IsFull)
                .Select(s => new TimeSlotDto
                {
                    Id = s.Id,
                    RouteId = s.RouteId,
                    RouteName = s.Route?.Name ?? string.Empty,
                    StartTime = s.StartTime,
                    EndTime = s.EndTime,
                    Capacity = s.Capacity,
                    Available = s.Capacity - s.BookedCount,
                    Status = s.Status.ToString()
                })
                .ToList();
        }

        private static RouteDto MapToDto(Route r) => new()
        {
            Id = r.Id,
            Name = r.Name,
            Description = r.Description,
            ThumbnailUrl = r.ThumbnailUrl,
            EstimatedMinutes = r.EstimatedMinutes,
            Status = r.Status.ToString(),
            Waypoints = r.Waypoints.Select(w => new WaypointDto
            {
                Id = w.Id,
                Order = w.Order,
                Lat = w.Lat,
                Lng = w.Lng,
                Label = w.Label,
                POI = w.POI == null ? null : new POIDto
                {
                    Id = w.POI.Id,
                    Name = w.POI.Name,
                    Description = w.POI.Description,
                    ImageUrl = w.POI.ImageUrl
                }
            }).ToList()
        };
    }
}
