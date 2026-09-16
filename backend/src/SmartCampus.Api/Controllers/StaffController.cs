using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Application.Common.Authorization;
using SmartCampus.Application.Staff;
using SmartCampus.Application.Staff.DTOs;
using System.Security.Claims;

namespace SmartCampus.Api.Controllers
{
    [ApiController]
    [Route("api/staff")]
    [Authorize(Policy = StaffPolicies.StaffOnly)]
    public sealed class StaffController : ControllerBase
    {
        private readonly IStaffOperationsService _staffOperations;

        public StaffController(IStaffOperationsService staffOperations)
        {
            _staffOperations = staffOperations;
        }

        [HttpGet("dashboard")]
        public async Task<ActionResult<StaffDashboardDto>> GetDashboard([FromQuery] DateTime? date)
            => Ok(await _staffOperations.GetDashboardAsync(date));

        [HttpGet("schedule")]
        public async Task<ActionResult<List<StaffScheduleItemDto>>> GetSchedule([FromQuery] string? status, [FromQuery] DateTime? date, [FromQuery] Guid? routeId)
            => await ExecuteAsync(() => _staffOperations.GetScheduleAsync(status, date, routeId));

        [HttpGet("tour-sessions/{sessionId:guid}")]
        public async Task<ActionResult<TourSessionDetailDto>> GetTourSession(Guid sessionId)
        {
            var session = await _staffOperations.GetTourSessionAsync(sessionId);
            return session == null ? NotFound(new { message = "Phiên tour không tồn tại." }) : Ok(session);
        }

        [HttpGet("amrs")]
        public async Task<ActionResult<List<AmrStatusDto>>> GetAmrs()
            => Ok(await _staffOperations.GetAmrsAsync());

        [HttpGet("digital-twin")]
        public async Task<ActionResult<List<AmrStatusDto>>> GetDigitalTwinState()
            => Ok(await _staffOperations.GetAmrsAsync());

        [HttpGet("alerts")]
        public async Task<ActionResult<List<AlertDto>>> GetAlerts([FromQuery] bool? acknowledged, [FromQuery] string? severity)
            => await ExecuteAsync(() => _staffOperations.GetAlertsAsync(acknowledged, severity));

        [HttpPost("alerts/{alertId:guid}/acknowledge")]
        [Authorize(Policy = StaffPolicies.CanAcknowledgeAlert)]
        public Task<ActionResult<AlertDto>> AcknowledgeAlert(Guid alertId, [FromBody] AcknowledgeAlertRequest request)
            => ExecuteAsync(() => _staffOperations.AcknowledgeAlertAsync(alertId, GetUserId(), GetRole(), request, NewCorrelationId()));

        [HttpPost("tour-sessions/{sessionId:guid}/assignments")]
        public Task<ActionResult<AssignmentDto>> AssignAmr(Guid sessionId, [FromBody] AssignmentRequest request)
            => ExecuteAsync(() => _staffOperations.AssignAmrAsync(sessionId, GetUserId(), GetRole(), request, NewCorrelationId()));

        [HttpPut("tour-sessions/{sessionId:guid}/assignment")]
        public Task<ActionResult<AssignmentDto>> ReassignAmr(Guid sessionId, [FromBody] AssignmentRequest request)
            => ExecuteAsync(() => _staffOperations.ReassignAmrAsync(sessionId, GetUserId(), GetRole(), request, NewCorrelationId()));

        [HttpPost("tour-sessions/{sessionId:guid}/missions/pause")]
        [Authorize(Policy = StaffPolicies.CanControlMission)]
        public Task<ActionResult<MissionDto>> PauseMission(Guid sessionId, [FromBody] MissionCommandRequest request)
            => ExecuteMissionAsync(sessionId, "pause", request);

        [HttpPost("tour-sessions/{sessionId:guid}/missions/resume")]
        [Authorize(Policy = StaffPolicies.CanControlMission)]
        public Task<ActionResult<MissionDto>> ResumeMission(Guid sessionId, [FromBody] MissionCommandRequest request)
            => ExecuteMissionAsync(sessionId, "resume", request);

        [HttpPost("tour-sessions/{sessionId:guid}/missions/recall")]
        [Authorize(Policy = StaffPolicies.CanControlMission)]
        public Task<ActionResult<MissionDto>> RecallMission(Guid sessionId, [FromBody] MissionCommandRequest request)
            => ExecuteMissionAsync(sessionId, "recall", request);

        [HttpPost("tour-sessions/{sessionId:guid}/missions/cancel")]
        [Authorize(Policy = StaffPolicies.CanControlMission)]
        public Task<ActionResult<MissionDto>> CancelMission(Guid sessionId, [FromBody] MissionCommandRequest request)
            => ExecuteMissionAsync(sessionId, "cancel", request);

        [HttpPost("tour-sessions/{sessionId:guid}/missions/emergency-stop")]
        [Authorize(Policy = StaffPolicies.CanEmergencyStop)]
        public Task<ActionResult<MissionDto>> EmergencyStop(Guid sessionId, [FromBody] MissionCommandRequest request)
            => ExecuteMissionAsync(sessionId, "emergency-stop", request);

        [HttpGet("reports/feedback")]
        public Task<ActionResult<List<FeedbackReportDto>>> GetFeedbackReports([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? routeId, [FromQuery] int? rating, [FromQuery] string? status)
            => ExecuteAsync(() => _staffOperations.GetFeedbackReportsAsync(from, to, routeId, rating, status));

        private Task<ActionResult<MissionDto>> ExecuteMissionAsync(Guid sessionId, string command, MissionCommandRequest request)
            => ExecuteAsync(() => _staffOperations.ExecuteMissionCommandAsync(sessionId, GetUserId(), GetRole(), command, request, NewCorrelationId()));

        private Guid GetUserId()
        {
            var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(value, out var id) ? id : throw new UnauthorizedAccessException("Token không có định danh người dùng hợp lệ.");
        }

        private string GetRole() => User.FindFirstValue("role") ?? string.Empty;
        private static string NewCorrelationId() => Guid.NewGuid().ToString("N");

        private async Task<ActionResult<T>> ExecuteAsync<T>(Func<Task<T>> action)
        {
            try
            {
                return Ok(await action());
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }
        }
    }
}
