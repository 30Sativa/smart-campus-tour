using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Application.Routes;

namespace SmartCampus.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoutesController : ControllerBase
    {
        private readonly IRouteService _routeService;

        public RoutesController(IRouteService routeService)
        {
            _routeService = routeService;
        }

        /// <summary>GET /api/routes — Danh sách lộ trình đang published</summary>
        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> GetRoutes()
        {
            var routes = await _routeService.GetPublishedRoutesAsync();
            return Ok(routes);
        }

        /// <summary>GET /api/routes/{id} — Chi tiết lộ trình + waypoints</summary>
        [HttpGet("{id:guid}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetRoute(Guid id)
        {
            var route = await _routeService.GetRouteByIdAsync(id);
            if (route == null) return NotFound(new { message = "Lộ trình không tồn tại." });
            return Ok(route);
        }

        /// <summary>GET /api/routes/{id}/slots — Time slots còn trống</summary>
        [HttpGet("{id:guid}/slots")]
        [AllowAnonymous]
        public async Task<IActionResult> GetSlots(Guid id, [FromQuery] DateTime? from)
        {
            var slots = await _routeService.GetAvailableSlotsAsync(id, from);
            return Ok(slots);
        }
    }
}
