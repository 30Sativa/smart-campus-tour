using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCampus.Infrastructure.Persistence.Migrations
{
    public partial class AddStaffOperations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorRole = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TargetType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TargetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BeforeState = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AfterState = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Result = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CorrelationId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuditLogs_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AMRAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TourSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AMRUnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AssignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AMRAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AMRAssignments_AMRUnits_AMRUnitId",
                        column: x => x.AMRUnitId,
                        principalTable: "AMRUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AMRAssignments_TourSessions_TourSessionId",
                        column: x => x.TourSessionId,
                        principalTable: "TourSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AMRAssignments_Users_AssignedByUserId",
                        column: x => x.AssignedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Missions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TourSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AMRUnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    State = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CurrentWaypointId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    NextWaypointId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ProgressPercent = table.Column<int>(type: "int", nullable: false),
                    FailureReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LastCorrelationId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Missions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Missions_AMRUnits_AMRUnitId",
                        column: x => x.AMRUnitId,
                        principalTable: "AMRUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Missions_TourSessions_TourSessionId",
                        column: x => x.TourSessionId,
                        principalTable: "TourSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Missions_Waypoints_CurrentWaypointId",
                        column: x => x.CurrentWaypointId,
                        principalTable: "Waypoints",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.NoAction);
                    table.ForeignKey(
                        name: "FK_Missions_Waypoints_NextWaypointId",
                        column: x => x.NextWaypointId,
                        principalTable: "Waypoints",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.NoAction);
                });

            migrationBuilder.CreateTable(
                name: "OperationalAlerts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Severity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AMRUnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TourSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AcknowledgedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AcknowledgedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResolutionNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OperationalAlerts_AMRUnits_AMRUnitId",
                        column: x => x.AMRUnitId,
                        principalTable: "AMRUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_OperationalAlerts_TourSessions_TourSessionId",
                        column: x => x.TourSessionId,
                        principalTable: "TourSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_OperationalAlerts_Users_AcknowledgedByUserId",
                        column: x => x.AcknowledgedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.NoAction);
                });

            migrationBuilder.CreateTable(
                name: "TourTimelineEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TourSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TourTimelineEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TourTimelineEvents_TourSessions_TourSessionId",
                        column: x => x.TourSessionId,
                        principalTable: "TourSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(name: "IX_AMRAssignments_AMRUnitId", table: "AMRAssignments", column: "AMRUnitId");
            migrationBuilder.CreateIndex(name: "IX_AMRAssignments_AssignedByUserId", table: "AMRAssignments", column: "AssignedByUserId");
            migrationBuilder.CreateIndex(name: "IX_AMRAssignments_TourSessionId_Status", table: "AMRAssignments", columns: new[] { "TourSessionId", "Status" }, unique: true, filter: "[Status] = 'Active'");
            migrationBuilder.CreateIndex(name: "IX_AuditLogs_ActorUserId", table: "AuditLogs", column: "ActorUserId");
            migrationBuilder.CreateIndex(name: "IX_AuditLogs_CorrelationId", table: "AuditLogs", column: "CorrelationId");
            migrationBuilder.CreateIndex(name: "IX_AuditLogs_TargetType_TargetId_CreatedAt", table: "AuditLogs", columns: new[] { "TargetType", "TargetId", "CreatedAt" });
            migrationBuilder.CreateIndex(name: "IX_Missions_AMRUnitId", table: "Missions", column: "AMRUnitId");
            migrationBuilder.CreateIndex(name: "IX_Missions_CurrentWaypointId", table: "Missions", column: "CurrentWaypointId");
            migrationBuilder.CreateIndex(name: "IX_Missions_NextWaypointId", table: "Missions", column: "NextWaypointId");
            migrationBuilder.CreateIndex(name: "IX_Missions_TourSessionId", table: "Missions", column: "TourSessionId");
            migrationBuilder.CreateIndex(name: "IX_OperationalAlerts_AcknowledgedByUserId", table: "OperationalAlerts", column: "AcknowledgedByUserId");
            migrationBuilder.CreateIndex(name: "IX_OperationalAlerts_AMRUnitId", table: "OperationalAlerts", column: "AMRUnitId");
            migrationBuilder.CreateIndex(name: "IX_OperationalAlerts_TourSessionId", table: "OperationalAlerts", column: "TourSessionId");
            migrationBuilder.CreateIndex(name: "IX_TourTimelineEvents_TourSessionId_OccurredAt", table: "TourTimelineEvents", columns: new[] { "TourSessionId", "OccurredAt" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AMRAssignments");
            migrationBuilder.DropTable(name: "AuditLogs");
            migrationBuilder.DropTable(name: "Missions");
            migrationBuilder.DropTable(name: "OperationalAlerts");
            migrationBuilder.DropTable(name: "TourTimelineEvents");
        }
    }
}
