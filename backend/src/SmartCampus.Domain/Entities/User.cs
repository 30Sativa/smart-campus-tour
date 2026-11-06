using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class User
{
    public Guid Id { get; set; }

    public string Username { get; set; } = null!;

    public string NormalizedUsername { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string FullName { get; set; } = null!;

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual ICollection<BranchRequest> BranchRequestRequestedByUsers { get; set; } = new List<BranchRequest>();

    public virtual ICollection<BranchRequest> BranchRequestResolvedByUsers { get; set; } = new List<BranchRequest>();

    public virtual ICollection<GroupRegistration> GroupRegistrationRepresentativeUsers { get; set; } = new List<GroupRegistration>();

    public virtual ICollection<GroupRegistration> GroupRegistrationReviewedByUsers { get; set; } = new List<GroupRegistration>();

    public virtual ICollection<MapArea> MapAreas { get; set; } = new List<MapArea>();

    public virtual ICollection<MapDeploymentCheck> MapDeploymentChecks { get; set; } = new List<MapDeploymentCheck>();

    public virtual ICollection<MapVersion> MapVersions { get; set; } = new List<MapVersion>();

    public virtual ICollection<Robot> MapAssignedRobots { get; set; } = new List<Robot>();

    public virtual ICollection<PoiImportReceipt> PoiImportReceipts { get; set; } = new List<PoiImportReceipt>();

    public virtual ICollection<PoiProposalRevision> PoiProposalRevisions { get; set; } = new List<PoiProposalRevision>();

    public virtual ICollection<PoiProposalSubmission> PoiProposalSubmissions { get; set; } = new List<PoiProposalSubmission>();

    public virtual ICollection<PoiProposal> PoiProposals { get; set; } = new List<PoiProposal>();

    public virtual ICollection<PoiVerificationRecord> PoiVerificationRecords { get; set; } = new List<PoiVerificationRecord>();

    public virtual ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();

    public virtual ICollection<RobotCommand> RobotCommandIssuedByUsers { get; set; } = new List<RobotCommand>();

    public virtual ICollection<RobotCommand> RobotCommandResolvedByUsers { get; set; } = new List<RobotCommand>();

    public virtual ICollection<RouteRevisionSubmission> RouteRevisionSubmissions { get; set; } = new List<RouteRevisionSubmission>();

    public virtual ICollection<RouteRevision> RouteRevisions { get; set; } = new List<RouteRevision>();

    public virtual ICollection<RouteTestRun> RouteTestRunCheckedByUsers { get; set; } = new List<RouteTestRun>();

    public virtual ICollection<RouteTestRun> RouteTestRunParticipatingStaffUsers { get; set; } = new List<RouteTestRun>();

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();

    public virtual ICollection<Tour> TourOperatorUsers { get; set; } = new List<Tour>();

    public virtual ICollection<TourRobotReservation> TourRobotReservationReleasedByUsers { get; set; } = new List<TourRobotReservation>();

    public virtual ICollection<TourRobotReservation> TourRobotReservationReservedByUsers { get; set; } = new List<TourRobotReservation>();

    public virtual ICollection<TourScheduleBlock> TourScheduleBlockCreatedByUsers { get; set; } = new List<TourScheduleBlock>();

    public virtual ICollection<TourScheduleBlock> TourScheduleBlockRemovedByUsers { get; set; } = new List<TourScheduleBlock>();

    public virtual ICollection<Tour> Tours { get; set; } = new List<Tour>();

    public virtual ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}
