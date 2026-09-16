using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Staff;
using SmartCampus.Application.Staff.DTOs;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Staff
{
    public sealed class StaffOperationsService : IStaffOperationsService
    {
        private const int StaleTelemetrySeconds = 60;
        private const double MinimumDispatchBatteryPercent = 20;
        private readonly ApplicationDbContext _context;

        public StaffOperationsService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<StaffDashboardDto> GetDashboardAsync(DateTime? date = null)
        {
            var day = (date ?? DateTime.UtcNow).Date;
            var nextDay = day.AddDays(1);
            var now = DateTime.UtcNow;
            var sessions = await SessionQuery().ToListAsync();
            var amrs = await _context.AMRUnits.AsNoTracking().ToListAsync();
            var openAlerts = await _context.OperationalAlerts
                .Include(a => a.AMRUnit)
                .Include(a => a.AcknowledgedByUser)
                .Where(a => a.AcknowledgedAt == null)
                .OrderByDescending(a => a.CreatedAt)
                .Take(10)
                .ToListAsync();

            var today = sessions.Where(s => s.Booking!.Slot!.StartTime >= day && s.Booking.Slot.StartTime < nextDay).ToList();
            var active = sessions.Where(s => s.Status == SessionStatus.Active || s.Status == SessionStatus.Paused).ToList();
            var mappedAmrs = await MapAmrsAsync(amrs, sessions);

            return new StaffDashboardDto
            {
                TodayTours = today.Count,
                UpcomingTours = sessions.Count(s => s.Status == SessionStatus.Scheduled && s.Booking!.Slot!.StartTime > now),
                ActiveTours = active.Count,
                CompletedTours = sessions.Count(s => s.Status == SessionStatus.Completed),
                PendingTours = sessions.Count(s => s.Status == SessionStatus.Scheduled),
                ActiveAmrs = mappedAmrs.Count(a => a.ConnectionState == AMRConnectionState.Live.ToString() && a.OperationalState != MissionState.Idle.ToString()),
                OfflineAmrs = mappedAmrs.Count(a => a.ConnectionState == AMRConnectionState.Disconnected.ToString()),
                ActiveAlerts = openAlerts.Count,
                CriticalAlerts = openAlerts.Count(a => a.Severity == AlertSeverity.Critical),
                TodaySchedule = today.OrderBy(s => s.Booking!.Slot!.StartTime).Select(ToScheduleDto).ToList(),
                ActiveAmrsList = mappedAmrs.Where(a => a.OperationalState != MissionState.Idle.ToString() || a.ConnectionState != AMRConnectionState.Live.ToString()).ToList(),
                RecentAlerts = openAlerts.Select(ToAlertDto).ToList(),
                ActiveSessions = active.OrderBy(s => s.Booking!.Slot!.StartTime).Select(ToSummaryDto).ToList()
            };
        }

        public async Task<List<StaffScheduleItemDto>> GetScheduleAsync(string? status, DateTime? date, Guid? routeId)
        {
            var sessions = SessionQuery();
            if (date.HasValue)
            {
                var start = date.Value.Date;
                sessions = sessions.Where(s => s.Booking!.Slot!.StartTime >= start && s.Booking.Slot.StartTime < start.AddDays(1));
            }
            if (routeId.HasValue)
                sessions = sessions.Where(s => s.Booking!.Slot!.RouteId == routeId);
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                if (status.Equals("Today", StringComparison.OrdinalIgnoreCase))
                {
                    var start = DateTime.UtcNow.Date;
                    sessions = sessions.Where(s => s.Booking!.Slot!.StartTime >= start && s.Booking.Slot.StartTime < start.AddDays(1));
                }
                else if (status.Equals("Upcoming", StringComparison.OrdinalIgnoreCase))
                    sessions = sessions.Where(s => s.Status == SessionStatus.Scheduled && s.Booking!.Slot!.StartTime > DateTime.UtcNow);
                else if (Enum.TryParse<SessionStatus>(status, true, out var parsed))
                    sessions = sessions.Where(s => s.Status == parsed);
                else
                    throw new InvalidOperationException("Trạng thái lịch tour không hợp lệ.");
            }

            return (await sessions.OrderBy(s => s.Booking!.Slot!.StartTime).ToListAsync()).Select(ToScheduleDto).ToList();
        }

        public async Task<TourSessionDetailDto?> GetTourSessionAsync(Guid sessionId)
        {
            var session = await SessionQuery().FirstOrDefaultAsync(s => s.Id == sessionId);
            if (session == null) return null;

            var alerts = await _context.OperationalAlerts
                .Include(a => a.AMRUnit).Include(a => a.AcknowledgedByUser)
                .Where(a => a.TourSessionId == sessionId)
                .OrderByDescending(a => a.CreatedAt).ToListAsync();
            var assignments = await _context.AMRAssignments
                .Include(a => a.AMRUnit).Include(a => a.AssignedByUser)
                .Where(a => a.TourSessionId == sessionId).OrderByDescending(a => a.AssignedAt).ToListAsync();

            return new TourSessionDetailDto
            {
                Id = session.Id,
                BookingId = session.BookingId,
                Status = session.Status.ToString(),
                RouteName = session.Booking!.Slot!.Route!.Name,
                StartTime = session.Booking.Slot.StartTime,
                EndTime = session.Booking.Slot.EndTime,
                VisitorName = session.Booking.User?.Username ?? string.Empty,
                AmrName = session.AssignedAMR?.Name,
                Mission = session.Missions.OrderByDescending(m => m.CreatedAt).Select(ToMissionDto).FirstOrDefault(),
                Timeline = session.TimelineEvents.OrderBy(e => e.OccurredAt).Select(e => new TimelineEventDto { Id = e.Id, Type = e.Type.ToString(), Detail = e.Detail, OccurredAt = e.OccurredAt }).ToList(),
                Alerts = alerts.Select(ToAlertDto).ToList(),
                Assignments = assignments.Select(a => new AssignmentDto
                {
                    Id = a.Id, AmrUnitId = a.AMRUnitId, AmrName = a.AMRUnit?.Name ?? string.Empty,
                    Status = a.Status.ToString(), AssignedBy = a.AssignedByUser?.Username ?? string.Empty,
                    Reason = a.Reason, AssignedAt = a.AssignedAt, ClosedAt = a.ClosedAt
                }).ToList()
            };
        }

        public async Task<List<AmrStatusDto>> GetAmrsAsync()
        {
            var amrs = await _context.AMRUnits.AsNoTracking().ToListAsync();
            var sessions = await SessionQuery().ToListAsync();
            return await MapAmrsAsync(amrs, sessions);
        }

        public async Task<List<AlertDto>> GetAlertsAsync(bool? acknowledged, string? severity)
        {
            var query = _context.OperationalAlerts
                .Include(a => a.AMRUnit).Include(a => a.AcknowledgedByUser)
                .AsQueryable();
            if (acknowledged.HasValue)
                query = query.Where(a => acknowledged.Value ? a.AcknowledgedAt != null : a.AcknowledgedAt == null);
            if (!string.IsNullOrWhiteSpace(severity))
            {
                if (!Enum.TryParse<AlertSeverity>(severity, true, out var parsed))
                    throw new InvalidOperationException("Mức độ cảnh báo không hợp lệ.");
                query = query.Where(a => a.Severity == parsed);
            }
            return (await query.OrderByDescending(a => a.CreatedAt).ToListAsync()).Select(ToAlertDto).ToList();
        }

        public async Task<AlertDto> AcknowledgeAlertAsync(Guid alertId, Guid actorUserId, string actorRole, AcknowledgeAlertRequest request, string correlationId)
        {
            var alert = await _context.OperationalAlerts.Include(a => a.AMRUnit).Include(a => a.AcknowledgedByUser)
                .FirstOrDefaultAsync(a => a.Id == alertId) ?? throw new KeyNotFoundException("Cảnh báo không tồn tại.");
            if (alert.AcknowledgedAt != null)
                throw new InvalidOperationException("Cảnh báo này đã được xác nhận.");

            alert.AcknowledgedAt = DateTime.UtcNow;
            alert.AcknowledgedByUserId = actorUserId;
            alert.ResolutionNote = NormalizeOptionalText(request.ResolutionNote);
            await AddAuditAsync(actorUserId, actorRole, "AcknowledgeAlert", "OperationalAlert", alert.Id, "Unacknowledged", "Acknowledged", "Succeeded", alert.ResolutionNote, correlationId);
            await _context.SaveChangesAsync();
            return ToAlertDto(alert);
        }

        public async Task<AssignmentDto> AssignAmrAsync(Guid sessionId, Guid actorUserId, string actorRole, AssignmentRequest request, string correlationId)
        {
            var session = await LoadSessionForCommandAsync(sessionId);
            if (session.Status != SessionStatus.Scheduled)
                throw new InvalidOperationException("Chỉ có thể gán AMR cho phiên tour chưa bắt đầu.");
            if (session.Assignments.Any(a => a.Status == AssignmentStatus.Active) || session.AssignedAMRId.HasValue)
                throw new InvalidOperationException("Phiên tour đã có AMR đang được gán. Hãy dùng chức năng gán lại.");

            var amr = await ValidateAmrForAssignmentAsync(request.AmrUnitId, session.Id);
            var assignment = CreateAssignment(session, amr, actorUserId, NormalizeOptionalText(request.Reason));
            _context.AMRAssignments.Add(assignment);
            _context.Missions.Add(new Mission { TourSessionId = session.Id, AMRUnitId = amr.Id, State = MissionState.Idle });
            AddTimeline(session, TimelineEventType.Assigned, $"AMR {amr.Name} được gán cho phiên tour.");
            await AddAuditAsync(actorUserId, actorRole, "AssignAmr", "TourSession", session.Id, null, amr.Id.ToString(), "Succeeded", assignment.Reason, correlationId);
            await _context.SaveChangesAsync();
            return ToAssignmentDto(assignment, amr);
        }

        public async Task<AssignmentDto> ReassignAmrAsync(Guid sessionId, Guid actorUserId, string actorRole, AssignmentRequest request, string correlationId)
        {
            var reason = NormalizeOptionalText(request.Reason);
            if (string.IsNullOrWhiteSpace(reason))
                throw new InvalidOperationException("Phải nhập lý do khi gán lại AMR.");

            var session = await LoadSessionForCommandAsync(sessionId);
            if (session.Status != SessionStatus.Scheduled)
                throw new InvalidOperationException("Chỉ có thể gán lại AMR cho phiên tour chưa bắt đầu.");
            var oldAssignment = session.Assignments.SingleOrDefault(a => a.Status == AssignmentStatus.Active)
                ?? throw new InvalidOperationException("Phiên tour chưa có AMR đang được gán.");
            if (oldAssignment.AMRUnitId == request.AmrUnitId)
                throw new InvalidOperationException("AMR mới phải khác AMR hiện tại.");

            var amr = await ValidateAmrForAssignmentAsync(request.AmrUnitId, session.Id);
            oldAssignment.Status = AssignmentStatus.Reassigned;
            oldAssignment.ClosedAt = DateTime.UtcNow;
            var oldMission = session.Missions.Where(m => m.AMRUnitId == oldAssignment.AMRUnitId && m.State == MissionState.Idle).OrderByDescending(m => m.CreatedAt).FirstOrDefault();
            if (oldMission != null) oldMission.State = MissionState.Cancelled;
            var assignment = CreateAssignment(session, amr, actorUserId, reason);
            _context.AMRAssignments.Add(assignment);
            _context.Missions.Add(new Mission { TourSessionId = session.Id, AMRUnitId = amr.Id, State = MissionState.Idle });
            AddTimeline(session, TimelineEventType.Assigned, $"Gán lại từ {oldAssignment.AMRUnit?.Name ?? "AMR cũ"} sang {amr.Name}. Lý do: {reason}");
            await AddAuditAsync(actorUserId, actorRole, "ReassignAmr", "TourSession", session.Id, oldAssignment.AMRUnitId.ToString(), amr.Id.ToString(), "Succeeded", reason, correlationId);
            await _context.SaveChangesAsync();
            return ToAssignmentDto(assignment, amr);
        }

        public async Task<MissionDto> ExecuteMissionCommandAsync(Guid sessionId, Guid actorUserId, string actorRole, string command, MissionCommandRequest request, string correlationId)
        {
            var normalized = command.Trim().ToLowerInvariant();
            if (normalized is not ("pause" or "resume" or "recall" or "cancel" or "emergency-stop"))
                throw new InvalidOperationException("Lệnh vận hành không hợp lệ.");

            var session = await LoadSessionForCommandAsync(sessionId);
            var mission = session.Missions.OrderByDescending(m => m.CreatedAt).FirstOrDefault()
                ?? throw new InvalidOperationException("Phiên tour chưa có mission để điều khiển.");
            var before = mission.State.ToString();
            var reason = NormalizeOptionalText(request.Reason);
            TimelineEventType eventType;

            switch (normalized)
            {
                case "pause":
                    RequireMissionState(mission, MissionState.Navigating, "Chỉ có thể tạm dừng mission đang điều hướng.");
                    mission.State = MissionState.Paused;
                    session.Status = SessionStatus.Paused;
                    eventType = TimelineEventType.Paused;
                    break;
                case "resume":
                    RequireMissionState(mission, MissionState.Paused, "Chỉ có thể tiếp tục mission đã tạm dừng. AMR E-Stop phải được xử lý bằng hành động riêng, không tự động tiếp tục.");
                    mission.State = MissionState.Navigating;
                    session.Status = SessionStatus.Active;
                    eventType = TimelineEventType.Resumed;
                    break;
                case "recall":
                    if (mission.State is not (MissionState.Navigating or MissionState.Paused))
                        throw new InvalidOperationException("Chỉ có thể gọi AMR về từ mission đang điều hướng hoặc tạm dừng.");
                    mission.State = MissionState.RecallRequested;
                    eventType = TimelineEventType.Recalled;
                    break;
                case "cancel":
                    if (mission.State is MissionState.Completed or MissionState.Cancelled)
                        throw new InvalidOperationException("Mission đã kết thúc và không thể hủy.");
                    mission.State = MissionState.Cancelled;
                    mission.CompletedAt = DateTime.UtcNow;
                    session.Status = SessionStatus.Cancelled;
                    session.CompletedAt = DateTime.UtcNow;
                    session.Booking!.Status = BookingStatus.Cancelled;
                    session.Booking.CancelledAt = DateTime.UtcNow;
                    CloseActiveAssignment(session);
                    eventType = TimelineEventType.Cancelled;
                    break;
                default:
                    if (mission.State is MissionState.Completed or MissionState.Cancelled)
                        throw new InvalidOperationException("Không thể E-Stop mission đã kết thúc.");
                    mission.State = MissionState.EmergencyStopped;
                    session.Status = SessionStatus.Paused;
                    _context.OperationalAlerts.Add(new OperationalAlert
                    {
                        Type = AlertType.EmergencyStop,
                        Severity = AlertSeverity.Critical,
                        Message = $"AMR đã nhận lệnh E-Stop cho phiên tour {session.Id}.",
                        AMRUnitId = mission.AMRUnitId,
                        TourSessionId = session.Id
                    });
                    eventType = TimelineEventType.EmergencyStopped;
                    break;
            }

            mission.LastCorrelationId = correlationId;
            AddTimeline(session, eventType, reason);
            await AddAuditAsync(actorUserId, actorRole, $"Mission{normalized}", "Mission", mission.Id, before, mission.State.ToString(), "Recorded", reason, correlationId);
            await _context.SaveChangesAsync();
            return ToMissionDto(mission);
        }

        public async Task<List<FeedbackReportDto>> GetFeedbackReportsAsync(DateTime? from, DateTime? to, Guid? routeId, int? rating, string? status)
        {
            if (rating is < 1 or > 5) throw new InvalidOperationException("Điểm đánh giá phải từ 1 đến 5.");
            var query = _context.Bookings.Include(b => b.Slot).ThenInclude(s => s!.Route).AsQueryable();
            if (from.HasValue) query = query.Where(b => b.Slot!.StartTime >= from.Value.Date);
            if (to.HasValue) query = query.Where(b => b.Slot!.StartTime < to.Value.Date.AddDays(1));
            if (routeId.HasValue) query = query.Where(b => b.Slot!.RouteId == routeId);
            if (rating.HasValue) query = query.Where(b => b.FeedbackRating == rating);
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<BookingStatus>(status, true, out var parsed)) throw new InvalidOperationException("Trạng thái booking không hợp lệ.");
                query = query.Where(b => b.Status == parsed);
            }

            return await query.OrderByDescending(b => b.Slot!.StartTime).Select(b => new FeedbackReportDto
            {
                BookingId = b.Id, RouteName = b.Slot!.Route!.Name, TourDate = b.Slot.StartTime,
                BookingStatus = b.Status.ToString(), Rating = b.FeedbackRating, Comment = b.FeedbackComment
            }).ToListAsync();
        }

        private IQueryable<TourSession> SessionQuery() => _context.TourSessions
            .Include(s => s.Booking).ThenInclude(b => b!.User)
            .Include(s => s.Booking).ThenInclude(b => b!.Slot).ThenInclude(slot => slot!.Route)
            .Include(s => s.AssignedAMR)
            .Include(s => s.Missions).ThenInclude(m => m.CurrentWaypoint).ThenInclude(w => w!.POI)
            .Include(s => s.Missions).ThenInclude(m => m.NextWaypoint).ThenInclude(w => w!.POI)
            .Include(s => s.Assignments).ThenInclude(a => a.AMRUnit)
            .Include(s => s.TimelineEvents);

        private async Task<TourSession> LoadSessionForCommandAsync(Guid sessionId) =>
            await SessionQuery().FirstOrDefaultAsync(s => s.Id == sessionId) ?? throw new KeyNotFoundException("Phiên tour không tồn tại.");

        private async Task<AMRUnit> ValidateAmrForAssignmentAsync(Guid amrId, Guid sessionId)
        {
            var amr = await _context.AMRUnits.FindAsync(amrId) ?? throw new KeyNotFoundException("AMR không tồn tại.");
            if (amr.Status != AMRStatus.Idle) throw new InvalidOperationException("AMR không ở trạng thái sẵn sàng để nhận tour.");
            if (GetConnectionState(amr, DateTime.UtcNow) != AMRConnectionState.Live) throw new InvalidOperationException("AMR mất kết nối hoặc telemetry đã cũ; không thể gán tour.");
            if (amr.BatteryPercent < MinimumDispatchBatteryPercent) throw new InvalidOperationException($"Pin AMR dưới {MinimumDispatchBatteryPercent:0}% nên không thể gán tour.");
            var conflict = await _context.AMRAssignments.AnyAsync(a => a.AMRUnitId == amrId && a.TourSessionId != sessionId && a.Status == AssignmentStatus.Active);
            if (conflict) throw new InvalidOperationException("AMR đang được gán cho phiên tour khác.");
            return amr;
        }

        private async Task<List<AmrStatusDto>> MapAmrsAsync(List<AMRUnit> amrs, List<TourSession> sessions)
        {
            var now = DateTime.UtcNow;
            return await Task.FromResult(amrs.Select(amr =>
            {
                var session = sessions.FirstOrDefault(s => s.AssignedAMRId == amr.Id && s.Status is SessionStatus.Active or SessionStatus.Paused);
                var mission = session?.Missions.OrderByDescending(m => m.CreatedAt).FirstOrDefault();
                var connection = GetConnectionState(amr, now);
                return new AmrStatusDto
                {
                    Id = amr.Id, Name = amr.Name,
                    OperationalState = connection == AMRConnectionState.Disconnected ? AMRConnectionState.Disconnected.ToString() : mission?.State.ToString() ?? amr.Status.ToString(),
                    ConnectionState = connection.ToString(), BatteryPercent = amr.BatteryPercent,
                    Latitude = amr.LastLat, Longitude = amr.LastLng, LastSeenAt = amr.LastSeenAt,
                    TelemetryAgeSeconds = amr.LastSeenAt.HasValue ? Math.Max(0, (now - amr.LastSeenAt.Value).TotalSeconds) : null,
                    SensorHealth = amr.Status == AMRStatus.Error ? "Fault" : "Unavailable",
                    CurrentSessionId = session?.Id, CurrentSessionStatus = session?.Status.ToString(), CurrentMissionState = mission?.State.ToString(),
                    CurrentPoi = mission?.CurrentWaypoint?.POI?.Name ?? mission?.CurrentWaypoint?.Label
                };
            }).OrderBy(a => a.Name).ToList());
        }

        private static AMRConnectionState GetConnectionState(AMRUnit amr, DateTime now)
        {
            if (!amr.LastSeenAt.HasValue || amr.Status == AMRStatus.Offline) return AMRConnectionState.Disconnected;
            return now - amr.LastSeenAt.Value > TimeSpan.FromSeconds(StaleTelemetrySeconds) ? AMRConnectionState.Stale : AMRConnectionState.Live;
        }

        private static StaffScheduleItemDto ToScheduleDto(TourSession s) => new()
        {
            SessionId = s.Id, BookingId = s.BookingId, StartTime = s.Booking!.Slot!.StartTime, EndTime = s.Booking.Slot.EndTime,
            RouteName = s.Booking.Slot.Route!.Name, VisitorName = s.Booking.User?.Username ?? string.Empty,
            Status = s.Status.ToString(), AmrName = s.AssignedAMR?.Name
        };

        private static TourSessionSummaryDto ToSummaryDto(TourSession s)
        {
            var mission = s.Missions.OrderByDescending(m => m.CreatedAt).FirstOrDefault();
            return new TourSessionSummaryDto { Id = s.Id, Status = s.Status.ToString(), RouteName = s.Booking!.Slot!.Route!.Name, StartTime = s.Booking.Slot.StartTime, AmrName = s.AssignedAMR?.Name, MissionState = mission?.State.ToString(), ProgressPercent = mission?.ProgressPercent };
        }

        private static MissionDto ToMissionDto(Mission m) => new()
        {
            Id = m.Id, AmrUnitId = m.AMRUnitId, State = m.State.ToString(), ProgressPercent = m.ProgressPercent,
            CurrentWaypoint = m.CurrentWaypoint?.POI?.Name ?? m.CurrentWaypoint?.Label, NextWaypoint = m.NextWaypoint?.POI?.Name ?? m.NextWaypoint?.Label,
            FailureReason = m.FailureReason, CorrelationId = m.LastCorrelationId, StartedAt = m.StartedAt
        };

        private static AlertDto ToAlertDto(OperationalAlert a) => new()
        {
            Id = a.Id, Type = a.Type.ToString(), Severity = a.Severity.ToString(), Message = a.Message,
            AmrUnitId = a.AMRUnitId, AmrName = a.AMRUnit?.Name, TourSessionId = a.TourSessionId, CreatedAt = a.CreatedAt,
            AcknowledgedAt = a.AcknowledgedAt, AcknowledgedBy = a.AcknowledgedByUser?.Username, ResolutionNote = a.ResolutionNote, ResolvedAt = a.ResolvedAt
        };

        private static AMRAssignment CreateAssignment(TourSession session, AMRUnit amr, Guid actorUserId, string? reason)
        {
            session.AssignedAMRId = amr.Id;
            return new AMRAssignment { TourSessionId = session.Id, AMRUnitId = amr.Id, AssignedByUserId = actorUserId, Reason = reason };
        }

        private static AssignmentDto ToAssignmentDto(AMRAssignment assignment, AMRUnit amr) => new()
        {
            Id = assignment.Id, AmrUnitId = amr.Id, AmrName = amr.Name, Status = assignment.Status.ToString(),
            Reason = assignment.Reason, AssignedAt = assignment.AssignedAt
        };

        private static void RequireMissionState(Mission mission, MissionState expected, string message)
        {
            if (mission.State != expected) throw new InvalidOperationException(message);
        }

        private static void CloseActiveAssignment(TourSession session)
        {
            var assignment = session.Assignments.SingleOrDefault(a => a.Status == AssignmentStatus.Active);
            if (assignment == null) return;
            assignment.Status = AssignmentStatus.Closed;
            assignment.ClosedAt = DateTime.UtcNow;
        }

        private void AddTimeline(TourSession session, TimelineEventType type, string? detail) =>
            _context.TourTimelineEvents.Add(new TourTimelineEvent { TourSessionId = session.Id, Type = type, Detail = detail });

        private Task AddAuditAsync(Guid actorUserId, string actorRole, string action, string targetType, Guid targetId, string? before, string? after, string result, string? reason, string correlationId)
        {
            _context.AuditLogs.Add(new AuditLog
            {
                ActorUserId = actorUserId, ActorRole = actorRole, Action = action, TargetType = targetType, TargetId = targetId,
                BeforeState = before, AfterState = after, Result = result, Reason = reason, CorrelationId = correlationId
            });
            return Task.CompletedTask;
        }

        private static string? NormalizeOptionalText(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            return value.Trim().Length <= 1000 ? value.Trim() : throw new InvalidOperationException("Nội dung không được vượt quá 1000 ký tự.");
        }
    }
}
