namespace SmartCampus.Application.Common.Authorization
{
    public static class StaffRoles
    {
        public const string Visitor = "Visitor";
        public const string TourOperator = "TourOperator";
        public const string CampusStaff = "CampusStaff";
        public const string Admin = "Admin";

        public static readonly string[] All = [Visitor, TourOperator, CampusStaff, Admin];
        public static readonly string[] Staff = [TourOperator, CampusStaff, Admin];
        public static readonly string[] Operator = [TourOperator, CampusStaff, Admin];

        public static string Normalize(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return Visitor;
            var s = raw.Trim();
            if (s.Equals("tour_operator", StringComparison.OrdinalIgnoreCase) || s.Equals("tour operator", StringComparison.OrdinalIgnoreCase))
                return TourOperator;
            if (s.Equals("campus_staff", StringComparison.OrdinalIgnoreCase) || s.Equals("campus staff", StringComparison.OrdinalIgnoreCase))
                return CampusStaff;
            if (s.Equals("staff", StringComparison.OrdinalIgnoreCase)) return CampusStaff;
            if (s.Equals("ops", StringComparison.OrdinalIgnoreCase)) return CampusStaff;
            if (s.Equals("operator", StringComparison.OrdinalIgnoreCase)) return TourOperator;
            // case-insensitive match for canonical
            var found = All.FirstOrDefault(r => r.Equals(s, StringComparison.OrdinalIgnoreCase));
            return found ?? Visitor;
        }

        public static bool IsStaff(string? role) => Staff.Contains(Normalize(role), StringComparer.OrdinalIgnoreCase);
    }

    public static class StaffPermissions
    {
        public const string ViewDashboard = "staff:dashboard:view";
        public const string ViewSchedule = "staff:schedule:view";
        public const string ViewTourDetail = "staff:tour:view";
        public const string ViewAmr = "staff:amr:view";
        public const string ViewTwin = "staff:twin:view";
        public const string ViewAlerts = "staff:alerts:view";
        public const string AcknowledgeAlert = "staff:alerts:acknowledge";
        public const string ViewReports = "staff:reports:view";
        public const string AssignAmr = "staff:amr:assign";
        public const string ReassignAmr = "staff:amr:reassign";
        public const string ControlMission = "staff:mission:control";
        public const string EmergencyStop = "staff:mission:emergency_stop";

    }

    public static class StaffPolicies
    {
        public const string StaffOnly = "StaffOnly";
        public const string CanAcknowledgeAlert = "CanAcknowledgeAlert";
        public const string CanControlMission = "CanControlMission";
        public const string CanEmergencyStop = "CanEmergencyStop";
    }
}
