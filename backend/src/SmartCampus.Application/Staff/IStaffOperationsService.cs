using SmartCampus.Application.Staff.DTOs;

namespace SmartCampus.Application.Staff
{
    public interface IStaffOperationsService
    {
        Task<StaffDashboardDto> GetDashboardAsync(DateTime? date = null);
        Task<List<StaffScheduleItemDto>> GetScheduleAsync(string? status, DateTime? date, Guid? routeId);
        Task<TourSessionDetailDto?> GetTourSessionAsync(Guid sessionId);
        Task<List<AmrStatusDto>> GetAmrsAsync();
        Task<List<AlertDto>> GetAlertsAsync(bool? acknowledged, string? severity);
        Task<AlertDto> AcknowledgeAlertAsync(Guid alertId, Guid actorUserId, string actorRole, AcknowledgeAlertRequest request, string correlationId);
        Task<AssignmentDto> AssignAmrAsync(Guid sessionId, Guid actorUserId, string actorRole, AssignmentRequest request, string correlationId);
        Task<AssignmentDto> ReassignAmrAsync(Guid sessionId, Guid actorUserId, string actorRole, AssignmentRequest request, string correlationId);
        Task<MissionDto> ExecuteMissionCommandAsync(Guid sessionId, Guid actorUserId, string actorRole, string command, MissionCommandRequest request, string correlationId);
        Task<List<FeedbackReportDto>> GetFeedbackReportsAsync(DateTime? from, DateTime? to, Guid? routeId, int? rating, string? status);
    }
}
