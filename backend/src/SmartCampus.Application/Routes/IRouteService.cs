using SmartCampus.Application.Routes.DTOs;

namespace SmartCampus.Application.Routes
{
    public interface IRouteService
    {
        Task<List<RouteDto>> GetPublishedRoutesAsync();
        Task<RouteDto?> GetRouteByIdAsync(Guid id);
        Task<List<TimeSlotDto>> GetAvailableSlotsAsync(Guid routeId, DateTime? from = null);
    }
}
