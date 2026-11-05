using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence;

public partial class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<BranchRequest> BranchRequests { get; set; }

    public virtual DbSet<BrowserSession> BrowserSessions { get; set; }

    public virtual DbSet<GroupRegistration> GroupRegistrations { get; set; }

    public virtual DbSet<Invitation> Invitations { get; set; }

    public virtual DbSet<MapArea> MapAreas { get; set; }

    public virtual DbSet<MapDeploymentCheck> MapDeploymentChecks { get; set; }

    public virtual DbSet<MapVersion> MapVersions { get; set; }

    public virtual DbSet<Poi> Pois { get; set; }

    public virtual DbSet<PoiProposal> PoiProposals { get; set; }

    public virtual DbSet<PoiProposalRevision> PoiProposalRevisions { get; set; }

    public virtual DbSet<PoiProposalSubmission> PoiProposalSubmissions { get; set; }

    public virtual DbSet<PoiImportReceipt> PoiImportReceipts { get; set; }

    public virtual DbSet<PoiVerificationRecord> PoiVerificationRecords { get; set; }

    public virtual DbSet<RefreshToken> RefreshTokens { get; set; }

    public virtual DbSet<Robot> Robots { get; set; }

    public virtual DbSet<RobotCommand> RobotCommands { get; set; }

    public virtual DbSet<RosterRow> RosterRows { get; set; }

    public virtual DbSet<RosterEmailChangeRequest> RosterEmailChangeRequests { get; set; }

    public virtual DbSet<Route> Routes { get; set; }

    public virtual DbSet<RouteRevision> RouteRevisions { get; set; }

    public virtual DbSet<RouteRevisionStop> RouteRevisionStops { get; set; }

    public virtual DbSet<RouteRevisionSubmission> RouteRevisionSubmissions { get; set; }

    public virtual DbSet<RouteStop> RouteStops { get; set; }

    public virtual DbSet<RouteTestRun> RouteTestRuns { get; set; }

    public virtual DbSet<RouteVariant> RouteVariants { get; set; }

    public virtual DbSet<Tour> Tours { get; set; }

    public virtual DbSet<TourAllowedBranch> TourAllowedBranches { get; set; }

    public virtual DbSet<TourEvent> TourEvents { get; set; }

    public virtual DbSet<TourRobotReservation> TourRobotReservations { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserRole> UserRoles { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasIndex(e => new { e.CorrelationId, e.OccurredAt, e.Id }, "IX_AuditLogs_Correlation").HasFilter("([CorrelationId] IS NOT NULL)");

            entity.HasIndex(e => new { e.RobotId, e.CorrelationId }, "UX_AuditLogs_RobotCredentialRequest")
                .IsUnique()
                .HasFilter("([RobotId] IS NOT NULL AND [CorrelationId] IS NOT NULL AND [Action] IN (N'ROBOT_CREDENTIAL_ISSUED', N'ROBOT_CREDENTIAL_ROTATED', N'ROBOT_CREDENTIAL_REVOKED'))");

            entity.HasIndex(e => new { e.ActorUserId, e.CorrelationId }, "UX_AuditLogs_RobotMapAssignmentRequest")
                .IsUnique()
                .HasFilter("([ActorUserId] IS NOT NULL AND [CorrelationId] IS NOT NULL AND [Action] IN (N'ROBOT_MAP_ASSIGNED', N'ROBOT_MAP_CLEARED'))");

            entity.HasIndex(e => new { e.EntityType, e.EntityId, e.OccurredAt, e.Id }, "IX_AuditLogs_EntityTime");

            entity.Property(e => e.Action).HasMaxLength(80);
            entity.Property(e => e.EntityId).HasMaxLength(100);
            entity.Property(e => e.EntityType).HasMaxLength(50);
            entity.Property(e => e.OccurredAt).HasPrecision(3);
            entity.Property(e => e.ResultCode)
                .HasMaxLength(30)
                .IsUnicode(false);

            entity.HasOne(d => d.ActorUser).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.ActorUserId)
                .HasConstraintName("FK_AuditLogs_ActorUserId");

            entity.HasOne(d => d.Robot).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.RobotId)
                .HasConstraintName("FK_AuditLogs_RobotId");

            entity.HasOne(d => d.Tour).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.TourId)
                .HasConstraintName("FK_AuditLogs_TourId");
        });

        modelBuilder.Entity<BranchRequest>(entity =>
        {
            entity.HasIndex(e => e.TourId, "UX_BranchRequests_OneAccepted")
                .IsUnique()
                .HasFilter("([State]='ACCEPTED')");

            entity.HasIndex(e => new { e.TourId, e.RequestedByUserId, e.BranchPointRouteStopId }, "UX_BranchRequests_OnePending")
                .IsUnique()
                .HasFilter("([State]='PENDING')");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.DecisionReason).HasMaxLength(1000);
            entity.Property(e => e.ExpiredReason)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.RequestSource)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.RequestedAt).HasPrecision(3);
            entity.Property(e => e.ResolvedAt).HasPrecision(3);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.State)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.HasOne(d => d.BranchPointRouteStop).WithMany(p => p.BranchRequests)
                .HasForeignKey(d => d.BranchPointRouteStopId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BranchRequests_BranchPointRouteStopId");

            entity.HasOne(d => d.Registration).WithMany(p => p.BranchRequests)
                .HasForeignKey(d => d.RegistrationId)
                .HasConstraintName("FK_BranchRequests_RegistrationId");

            entity.HasOne(d => d.RequestedByUser).WithMany(p => p.BranchRequestRequestedByUsers)
                .HasForeignKey(d => d.RequestedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BranchRequests_RequestedByUserId");

            entity.HasOne(d => d.ResolvedByUser).WithMany(p => p.BranchRequestResolvedByUsers)
                .HasForeignKey(d => d.ResolvedByUserId)
                .HasConstraintName("FK_BranchRequests_ResolvedByUserId");

            entity.HasOne(d => d.TourAllowedBranch).WithMany(p => p.BranchRequests)
                .HasForeignKey(d => d.TourAllowedBranchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BranchRequests_TourAllowedBranchId");

            // Only ACCEPTED rows are unique by TourId; other request states can be many per Tour.
            entity.HasOne(d => d.Tour).WithMany(p => p.BranchRequests)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BranchRequests_TourId");
        });

        modelBuilder.Entity<BrowserSession>(entity =>
        {
            entity.HasIndex(e => e.SessionTokenHash, "UQ_BrowserSessions_Token").IsUnique();

            entity.HasIndex(e => e.InvitationId, "UX_BrowserSessions_OneOpen")
                .IsUnique()
                .HasFilter("([EndedAt] IS NULL)");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.EndReason)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.EndedAt).HasPrecision(3);
            entity.Property(e => e.ExpiresAt).HasPrecision(3);
            entity.Property(e => e.LastSeenAt).HasPrecision(3);
            entity.Property(e => e.SessionTokenHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.DeviceTokenHash)
                .HasMaxLength(32)
                .IsFixedLength();

            // Only open sessions are unique by InvitationId; ended sessions remain as history.
            entity.HasOne(d => d.Invitation).WithMany(p => p.BrowserSessions)
                .HasForeignKey(d => d.InvitationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BrowserSessions_InvitationId");
        });

        modelBuilder.Entity<GroupRegistration>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CancelledAt).HasPrecision(3);
            entity.Property(e => e.ContactEmail).HasMaxLength(254);
            entity.Property(e => e.ContactName).HasMaxLength(150);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.GroupName).HasMaxLength(200);
            entity.Property(e => e.RejectionReason).HasMaxLength(1000);
            entity.Property(e => e.ReviewedAt).HasPrecision(3);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.SchoolName).HasMaxLength(200);
            entity.Property(e => e.State)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.SubmittedAt).HasPrecision(3);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.RepresentativeUser).WithMany(p => p.GroupRegistrationRepresentativeUsers)
                .HasForeignKey(d => d.RepresentativeUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GroupRegistrations_RepresentativeUserId");

            entity.HasOne(d => d.ReviewedByUser).WithMany(p => p.GroupRegistrationReviewedByUsers)
                .HasForeignKey(d => d.ReviewedByUserId)
                .HasConstraintName("FK_GroupRegistrations_ReviewedByUserId");

            entity.HasOne(d => d.Tour).WithMany(p => p.GroupRegistrations)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GroupRegistrations_TourId");
        });

        modelBuilder.Entity<Invitation>(entity =>
        {
            entity.HasIndex(e => e.AccessCodeHash, "UQ_Invitations_CodeHash").IsUnique();

            entity.HasIndex(e => e.RosterRowId, "UQ_Invitations_RosterRow").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AccessCodeHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.CodeIssuedAt).HasPrecision(3);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.ExpiresAt).HasPrecision(3);
            entity.Property(e => e.RevokedAt).HasPrecision(3);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.RosterRow).WithOne(p => p.Invitation)
                .HasForeignKey<Invitation>(d => d.RosterRowId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Invitations_RosterRowId");
        });

        modelBuilder.Entity<MapArea>(entity =>
        {
            entity.HasKey(e => e.AreaKey);

            entity.Property(e => e.AreaKey).HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.DisplayName).HasMaxLength(150);

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.MapAreas)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MapAreas_CreatedByUserId");
        });

        modelBuilder.Entity<MapDeploymentCheck>(entity =>
        {
            entity.HasIndex(e => new { e.MapVersionId, e.CheckedAt, e.Id }, "IX_MapDeploymentChecks_VersionTime").IsDescending(false, true, false);

            entity.HasIndex(e => new { e.CheckedByUserId, e.RequestId }, "UQ_MapDeploymentChecks_ActorRequest").IsUnique();

            entity.HasIndex(e => new { e.Id, e.MapVersionId }, "UQ_MapDeploymentChecks_ExactMap").IsUnique();

            entity.HasIndex(e => new { e.Id, e.MapVersionId, e.PackageSha256 }, "UQ_MapDeploymentChecks_ExactMapChecksum").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CheckedAt).HasPrecision(3);
            entity.Property(e => e.EvidenceNote).HasMaxLength(2000);
            entity.Property(e => e.PackageSha256)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();

            entity.HasOne(d => d.CheckedByUser).WithMany(p => p.MapDeploymentChecks)
                .HasForeignKey(d => d.CheckedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MapDeploymentChecks_CheckedByUserId");

            entity.HasOne(d => d.MapVersion).WithMany(p => p.MapDeploymentChecks)
                .HasForeignKey(d => d.MapVersionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MapDeploymentChecks_MapVersionId");

            entity.HasOne(d => d.Robot).WithMany(p => p.MapDeploymentChecks)
                .HasForeignKey(d => d.RobotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MapDeploymentChecks_RobotId");
        });

        modelBuilder.Entity<MapVersion>(entity =>
        {
            entity.HasMany(map => map.AssignedRobots).WithOne(robot => robot.AssignedMapVersion)
                .HasForeignKey(robot => robot.AssignedMapVersionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Robots_AssignedMapVersionId");
            entity.HasIndex(e => new { e.AreaKey, e.UploadedAt, e.Id }, "IX_MapVersions_AreaUploaded").IsDescending(false, true, false);

            entity.HasIndex(e => new { e.AreaKey, e.PackageSha256 }, "UX_MapVersions_Area_PackageSha256").IsUnique();

            entity.HasIndex(e => new { e.AreaKey, e.VersionNumber }, "UQ_MapVersions_AreaVersion").IsUnique();

            entity.HasIndex(e => new { e.Id, e.PackageSha256 }, "UQ_MapVersions_ExactPackage").IsUnique();

            entity.HasIndex(e => e.MapKey, "UQ_MapVersions_MapKey").IsUnique();

            entity.HasIndex(e => new { e.UploadedByUserId, e.UploadRequestId }, "UQ_MapVersions_UploaderRequest").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AreaKey).HasMaxLength(100);
            entity.Property(e => e.FrameId).HasMaxLength(100);
            entity.Property(e => e.FreeThreshold).HasColumnType("decimal(5, 4)");
            entity.Property(e => e.ImageFileName).HasMaxLength(255);
            entity.Property(e => e.MapKey).HasMaxLength(100);
            entity.Property(e => e.OccupiedThreshold).HasColumnType("decimal(5, 4)");
            entity.Property(e => e.OriginX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.OriginY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.OriginYaw).HasColumnType("decimal(9, 6)");
            entity.Property(e => e.PackageFileName).HasMaxLength(255);
            entity.Property(e => e.PackageSha256)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.Resolution).HasColumnType("decimal(12, 6)");
            entity.Property(e => e.UploadedAt).HasPrecision(3);
            entity.Property(e => e.ValidationStatus)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.HasOne(d => d.AreaKeyNavigation).WithMany(p => p.MapVersions)
                .HasForeignKey(d => d.AreaKey)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MapVersions_AreaKey");

            entity.HasOne(d => d.UploadedByUser).WithMany(p => p.MapVersions)
                .HasForeignKey(d => d.UploadedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MapVersions_UploadedByUserId");
        });

        modelBuilder.Entity<Poi>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AudioUrl).HasMaxLength(1000);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.FallbackVideoUrl).HasMaxLength(1000);
            entity.Property(e => e.MapFrame).HasMaxLength(100);
            entity.Property(e => e.MapKey).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.UpdatedAt).HasPrecision(3);
            entity.Property(e => e.X).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Y).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Yaw).HasColumnType("decimal(9, 6)");
        });

        modelBuilder.Entity<PoiImportReceipt>(entity =>
        {
            entity.HasIndex(e => new { e.ImportedByUserId, e.RequestId, e.FileSha256 }, "UQ_PoiImportReceipts_RequestFile").IsUnique();

            entity.HasIndex(e => new { e.MapVersionId, e.FileSha256 }, "UX_PoiImportReceipts_MapFile")
                .IsUnique()
                .HasFilter("([Action]<>'NO_CHANGE')");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.Action)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.FileName).HasMaxLength(255);
            entity.Property(e => e.FileSha256)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.ImportedAt).HasPrecision(3);
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.SourcePoiId).HasMaxLength(64);

            entity.HasOne(d => d.ImportedByUser).WithMany(p => p.PoiImportReceipts)
                .HasForeignKey(d => d.ImportedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiImportReceipts_ImportedByUserId");

            entity.HasOne(d => d.MapVersion).WithMany(p => p.PoiImportReceipts)
                .HasForeignKey(d => d.MapVersionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiImportReceipts_MapVersionId");

            entity.HasOne(d => d.Proposal).WithMany(p => p.PoiImportReceipts)
                .HasForeignKey(d => d.ProposalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiImportReceipts_ProposalId");

            entity.HasOne(d => d.ProposalRevision).WithMany(p => p.PoiImportReceipts)
                .HasForeignKey(d => d.ProposalRevisionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiImportReceipts_ProposalRevisionId");

            entity.HasOne(d => d.Robot).WithMany(p => p.PoiImportReceipts)
                .HasForeignKey(d => d.RobotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiImportReceipts_RobotId");
        });

        modelBuilder.Entity<PoiProposal>(entity =>
        {
            entity.HasIndex(e => new { e.CreatedByUserId, e.CreateRequestId }, "UQ_PoiProposals_OwnerRequest").IsUnique();

            entity.HasIndex(e => new { e.SourceAreaKey, e.SourcePoiId }, "UX_PoiProposals_Source")
                .IsUnique()
                .HasFilter("([SourcePoiId] IS NOT NULL)");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreateRequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.SourceAreaKey).HasMaxLength(100);
            entity.Property(e => e.SourcePoiId).HasMaxLength(64);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.SourceAreaKeyNavigation).WithMany(p => p.PoiProposals)
                .HasForeignKey(d => d.SourceAreaKey)
                .HasConstraintName("FK_PoiProposals_SourceAreaKey");

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.PoiProposals)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiProposals_CreatedByUserId");
        });

        modelBuilder.Entity<PoiProposalRevision>(entity =>
        {
            entity.HasIndex(e => new { e.MapVersionId, e.CreatedAt, e.Id }, "IX_PoiProposalRevisions_MapVersion");

            entity.HasIndex(e => new { e.Id, e.MapVersionId, e.NavigationFingerprint }, "UQ_PoiProposalRevisions_ExactMapFingerprint").IsUnique();

            entity.HasIndex(e => new { e.ProposalId, e.RevisionNumber }, "UQ_PoiProposalRevisions_Number").IsUnique();

            entity.HasIndex(e => new { e.ProposalId, e.RequestId }, "UQ_PoiProposalRevisions_Request").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CameraPreset).HasMaxLength(80);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.NarrationText).HasMaxLength(4000);
            entity.Property(e => e.FallbackVideoUrl).HasMaxLength(2048);
            entity.Property(e => e.NavigationFingerprint)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.Purpose).HasMaxLength(500);
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.X).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Y).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Yaw).HasColumnType("decimal(9, 6)");

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.PoiProposalRevisions)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiProposalRevisions_CreatedByUserId");

            entity.HasOne(d => d.MapVersion).WithMany(p => p.PoiProposalRevisions)
                .HasForeignKey(d => d.MapVersionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiProposalRevisions_MapVersionId");

            entity.HasOne(d => d.Proposal).WithMany(p => p.PoiProposalRevisions)
                .HasForeignKey(d => d.ProposalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiProposalRevisions_ProposalId");
        });

        modelBuilder.Entity<PoiProposalSubmission>(entity =>
        {
            entity.HasIndex(e => new { e.SubmittedAt, e.ProposalRevisionId }, "IX_PoiProposalSubmissions_SubmittedAt");

            entity.HasIndex(e => new { e.SubmittedByUserId, e.RequestId }, "UQ_PoiProposalSubmissions_ActorRequest").IsUnique();

            entity.HasIndex(e => e.ProposalRevisionId, "UQ_PoiProposalSubmissions_Revision").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.SubmittedAt).HasPrecision(3);

            entity.HasOne(d => d.ProposalRevision).WithOne(p => p.PoiProposalSubmission)
                .HasForeignKey<PoiProposalSubmission>(d => d.ProposalRevisionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiProposalSubmissions_RevisionId");

            entity.HasOne(d => d.SubmittedByUser).WithMany(p => p.PoiProposalSubmissions)
                .HasForeignKey(d => d.SubmittedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiProposalSubmissions_SubmittedByUserId");
        });

        modelBuilder.Entity<PoiVerificationRecord>(entity =>
        {
            entity.HasIndex(e => new { e.MapVersionId, e.NavigationFingerprint, e.CheckedAt, e.Id }, "IX_PoiVerificationRecords_FingerprintTime").IsDescending(false, false, true, false);

            entity.HasIndex(e => new { e.CheckedByUserId, e.RequestId }, "UQ_PoiVerificationRecords_ActorRequest").IsUnique();

            entity.HasIndex(e => new { e.Id, e.MapVersionId, e.NavigationFingerprint }, "UQ_PoiVerificationRecords_ExactEvidence").IsUnique();

            entity.HasIndex(e => e.ProposalRevisionId, "UQ_PoiVerificationRecords_Revision").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CheckedAt).HasPrecision(3);
            entity.Property(e => e.EvidenceNote).HasMaxLength(2000);
            entity.Property(e => e.NavigationFingerprint)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.Reason).HasMaxLength(1000);
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.ResultCode)
                .HasMaxLength(10)
                .IsUnicode(false);
            entity.Property(e => e.SourceFileSha256)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.VerificationMethod)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("MANUAL_CHECK", "DF_PoiVerificationRecords_Method");

            entity.HasOne(d => d.CheckedByUser).WithMany(p => p.PoiVerificationRecords)
                .HasForeignKey(d => d.CheckedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiVerificationRecords_CheckedByUserId");

            entity.HasOne(d => d.MapVersion).WithMany(p => p.PoiVerificationRecords)
                .HasForeignKey(d => d.MapVersionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiVerificationRecords_MapVersionId");

            entity.HasOne(d => d.ProposalRevision).WithOne(p => p.PoiVerificationRecord)
                .HasForeignKey<PoiVerificationRecord>(d => d.ProposalRevisionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiVerificationRecords_RevisionId");

            entity.HasOne(d => d.Robot).WithMany(p => p.PoiVerificationRecords)
                .HasForeignKey(d => d.RobotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PoiVerificationRecords_RobotId");
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasIndex(e => e.TokenHash, "UQ_RefreshTokens_Token").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.ExpiresAt).HasPrecision(3);
            entity.Property(e => e.RevokedAt).HasPrecision(3);
            entity.Property(e => e.TokenHash)
                .HasMaxLength(32)
                .IsFixedLength();

            entity.HasOne(d => d.User).WithMany(p => p.RefreshTokens)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RefreshTokens_UserId");
        });

        modelBuilder.Entity<Robot>(entity =>
        {
            entity.HasIndex(e => e.AssignedMapVersionId, "IX_Robots_AssignedMapVersionId");
            entity.Property(e => e.MapAssignedAt).HasPrecision(3);
            entity.HasOne(d => d.MapAssignedByUser).WithMany(p => p.MapAssignedRobots)
                .HasForeignKey(d => d.MapAssignedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Robots_MapAssignedByUserId");
            entity.HasIndex(e => e.RobotCode, "UQ_Robots_RobotCode").IsUnique();

            entity.HasIndex(e => e.AssignedAreaKey, "UX_Robots_AssignedArea")
                .IsUnique()
                .HasFilter("([AssignedAreaKey] IS NOT NULL)");

            entity.Property(e => e.AssignedAreaKey).HasMaxLength(100);
            entity.Property(e => e.DeactivatedAt).HasPrecision(3);
            entity.Property(e => e.DeactivationReason).HasMaxLength(500);

            entity.HasIndex(e => e.CurrentTourId, "UX_Robots_CurrentTour")
                .IsUnique()
                .HasFilter("([CurrentTourId] IS NOT NULL)");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.CredentialHash).HasMaxLength(256);
            entity.Property(e => e.CredentialIssuedAt).HasPrecision(3);
            entity.Property(e => e.CredentialHint).HasMaxLength(4);
            entity.Property(e => e.CredentialRevokedAt).HasPrecision(3);
            entity.Property(e => e.DisplayName).HasMaxLength(150);
            entity.Property(e => e.FirstAcceptedSyncAt).HasPrecision(3);
            entity.Property(e => e.FirstAcceptedMapKey).HasMaxLength(100);
            entity.Property(e => e.FirstAcceptedFrameId).HasMaxLength(100);
            entity.Property(e => e.LastAssignedAt).HasPrecision(3);
            entity.Property(e => e.RobotCode).HasMaxLength(100);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.SourceType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.CredentialIssuedByUser).WithMany()
                .HasForeignKey(d => d.CredentialIssuedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Robots_CredentialIssuedByUserId");

            entity.HasOne(d => d.CredentialRevokedByUser).WithMany()
                .HasForeignKey(d => d.CredentialRevokedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Robots_CredentialRevokedByUserId");

            entity.HasOne(d => d.AssignedAreaKeyNavigation).WithMany()
                .HasForeignKey(d => d.AssignedAreaKey)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Robots_AssignedAreaKey");

            entity.HasOne(d => d.DeactivatedByUser).WithMany()
                .HasForeignKey(d => d.DeactivatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Robots_DeactivatedByUserId");

            entity.HasOne(d => d.CurrentTour).WithOne(p => p.Robot)
                .HasForeignKey<Robot>(d => d.CurrentTourId)
                .HasConstraintName("FK_Robots_CurrentTourId");
        });

        modelBuilder.Entity<RobotCommand>(entity =>
        {
            entity.HasIndex(e => new { e.RobotId, e.IssuedAt }, "IX_RobotCommands_RobotOpen").HasFilter("([IsOpen]=(1))");

            entity.HasIndex(e => new { e.State, e.AcceptBy }, "IX_RobotCommands_Sweep").HasFilter("([IsOpen]=(1))");

            entity.HasIndex(e => e.TargetCommandId, "IX_RobotCommands_TargetCommand").HasFilter("([TargetCommandId] IS NOT NULL)");

            entity.HasIndex(e => new { e.TourId, e.IssuedAt }, "IX_RobotCommands_Tour");

            entity.HasIndex(e => e.LegId, "UX_RobotCommands_OneGoToPerLeg")
                .IsUnique()
                .HasFilter("([Kind]='GoTo')");

            entity.HasIndex(e => e.LegId, "UX_RobotCommands_OneOpenCancelPerLeg")
                .IsUnique()
                .HasFilter("([Kind]='Cancel' AND [IsOpen]=(1))");

            entity.HasIndex(e => e.RobotId, "UX_RobotCommands_OneOpenGoTo")
                .IsUnique()
                .HasFilter("([Kind]='GoTo' AND [IsOpen]=(1))");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AcceptBy).HasPrecision(3);
            entity.Property(e => e.AcceptedAt).HasPrecision(3);
            entity.Property(e => e.CompletedAt).HasPrecision(3);
            entity.Property(e => e.DeliveredAt).HasPrecision(3);
            entity.Property(e => e.FrameId).HasMaxLength(100);
            entity.Property(e => e.IssuedAt).HasPrecision(3);
            entity.Property(e => e.Kind)
                .HasMaxLength(10)
                .IsUnicode(false);
            entity.Property(e => e.LegKind)
                .HasMaxLength(10)
                .IsUnicode(false);
            entity.Property(e => e.MapKey).HasMaxLength(100);
            entity.Property(e => e.Outcome)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.ReasonCode).HasMaxLength(100);
            entity.Property(e => e.ResolutionNote).HasMaxLength(1000);
            entity.Property(e => e.ResolvedAt).HasPrecision(3);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.State)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.X).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Y).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Yaw).HasColumnType("decimal(9, 6)");

            entity.HasOne(d => d.IssuedByUser).WithMany(p => p.RobotCommandIssuedByUsers)
                .HasForeignKey(d => d.IssuedByUserId)
                .HasConstraintName("FK_RobotCommands_IssuedByUserId");

            entity.HasOne(d => d.ResolvedByUser).WithMany(p => p.RobotCommandResolvedByUsers)
                .HasForeignKey(d => d.ResolvedByUserId)
                .HasConstraintName("FK_RobotCommands_ResolvedByUserId");

            entity.HasOne(d => d.Robot).WithMany(p => p.RobotCommands)
                .HasForeignKey(d => d.RobotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RobotCommands_RobotId");

            entity.HasOne(d => d.RouteRevisionStop).WithMany(p => p.RobotCommands)
                .HasForeignKey(d => d.RouteRevisionStopId)
                .HasConstraintName("FK_RobotCommands_RouteRevisionStopId");

            entity.HasOne(d => d.TargetCommand).WithMany(p => p.InverseTargetCommand)
                .HasForeignKey(d => d.TargetCommandId)
                .HasConstraintName("FK_RobotCommands_TargetCommandId");

            entity.HasOne(d => d.Tour).WithMany(p => p.RobotCommands)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RobotCommands_TourId");
        });

        modelBuilder.Entity<RosterRow>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.ClassName).HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.DisplayName).HasMaxLength(150);
            entity.Property(e => e.Email).HasMaxLength(254);
            entity.Property(e => e.ParticipationState).HasMaxLength(20).IsUnicode(false);
            entity.Property(e => e.ReviewReason).HasMaxLength(1000);
            entity.Property(e => e.ReviewedAt).HasPrecision(3);
            entity.Property(e => e.RowType)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.Registration).WithMany(p => p.RosterRows)
                .HasForeignKey(d => d.RegistrationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RosterRows_RegistrationId");
        });

        modelBuilder.Entity<RosterEmailChangeRequest>(entity =>
        {
            entity.HasIndex(e => new { e.RequestedByUserId, e.RequestId }, "UQ_RosterEmailChangeRequests_Request").IsUnique();
            entity.HasIndex(e => e.RosterRowId, "UX_RosterEmailChangeRequests_OnePending")
                .IsUnique().HasFilter("([State]='PENDING')");
            entity.HasIndex(e => new { e.State, e.CreatedAt, e.Id }, "IX_RosterEmailChangeRequests_Review");
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CurrentEmail).HasMaxLength(254);
            entity.Property(e => e.ProposedEmail).HasMaxLength(254);
            entity.Property(e => e.State).HasMaxLength(20).IsUnicode(false);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.ReviewedAt).HasPrecision(3);
            entity.Property(e => e.ReviewReason).HasMaxLength(1000);
            entity.Property(e => e.RowVersion).IsRowVersion().IsConcurrencyToken();
            entity.HasOne(d => d.RosterRow).WithMany(p => p.EmailChangeRequests)
                .HasForeignKey(d => d.RosterRowId).OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RosterEmailChangeRequests_RosterRow");
            entity.HasOne<User>().WithMany().HasForeignKey(e => e.RequestedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull).HasConstraintName("FK_RosterEmailChangeRequests_Requester");
            entity.HasOne<User>().WithMany().HasForeignKey(e => e.ReviewedByUserId)
                .HasConstraintName("FK_RosterEmailChangeRequests_Reviewer");
        });

        modelBuilder.Entity<Route>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AuthoringMode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("LEGACY", "DF_Routes_AuthoringMode");
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.EndMode)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.EndX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.EndY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.EndYaw).HasColumnType("decimal(9, 6)");
            entity.Property(e => e.MapFrame).HasMaxLength(100);
            entity.Property(e => e.MapKey).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.StartX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.StartY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.StartYaw).HasColumnType("decimal(9, 6)");
            entity.Property(e => e.UpdatedAt).HasPrecision(3);
        });

        modelBuilder.Entity<RouteRevision>(entity =>
        {
            entity.HasIndex(e => new { e.MapVersionId, e.CreatedAt, e.Id }, "IX_RouteRevisions_Map");

            entity.HasIndex(e => new { e.Id, e.MapVersionId }, "UQ_RouteRevisions_IdMap").IsUnique();

            entity.HasIndex(e => new { e.Id, e.MapVersionId, e.MapPackageSha256, e.NavigationFingerprint }, "UQ_RouteRevisions_MapChecksumFingerprint").IsUnique();

            entity.HasIndex(e => new { e.Id, e.MapVersionId, e.NavigationFingerprint }, "UQ_RouteRevisions_MapFingerprint").IsUnique();

            entity.HasIndex(e => new { e.RouteId, e.RevisionNumber }, "UQ_RouteRevisions_Number").IsUnique();

            entity.HasIndex(e => new { e.CreatedByUserId, e.RequestId }, "UQ_RouteRevisions_Request").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.EndMode)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.EndX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.EndY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.EndYaw).HasColumnType("decimal(9, 6)");
            entity.Property(e => e.MapPackageSha256)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.NavigationFingerprint)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.StartX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.StartY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.StartYaw).HasColumnType("decimal(9, 6)");

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.RouteRevisions)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisions_CreatedBy");

            entity.HasOne(d => d.MapVersion).WithMany(p => p.RouteRevisionMapVersions)
                .HasForeignKey(d => d.MapVersionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisions_Map");

            entity.HasOne(d => d.Route).WithMany(p => p.RouteRevisions)
                .HasForeignKey(d => d.RouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisions_Route");

            entity.HasOne(d => d.MapVersionNavigation).WithMany(p => p.RouteRevisionMapVersionNavigations)
                .HasPrincipalKey(p => new { p.Id, p.PackageSha256 })
                .HasForeignKey(d => new { d.MapVersionId, d.MapPackageSha256 })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisions_MapChecksum");
        });

        modelBuilder.Entity<RouteRevisionStop>(entity =>
        {
            entity.HasIndex(e => new { e.RouteRevisionId, e.StopOrder }, "UQ_RouteRevisionStops_Order").IsUnique();

            entity.HasIndex(e => new { e.RouteRevisionId, e.PoiProposalRevisionId }, "UQ_RouteRevisionStops_Poi").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CameraPreset).HasMaxLength(80);
            entity.Property(e => e.HeadStepsJson).HasMaxLength(4000);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.NarrationText).HasMaxLength(4000);
            entity.Property(e => e.FallbackVideoUrl).HasMaxLength(2048);
            entity.Property(e => e.PoiNavigationFingerprint)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.X).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Y).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Yaw).HasColumnType("decimal(9, 6)");

            entity.HasOne(d => d.RouteRevision).WithMany(p => p.RouteRevisionStops)
                .HasPrincipalKey(p => new { p.Id, p.MapVersionId })
                .HasForeignKey(d => new { d.RouteRevisionId, d.MapVersionId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisionStops_RevisionMap");

            entity.HasOne(d => d.PoiProposalRevision).WithMany(p => p.RouteRevisionStops)
                .HasPrincipalKey(p => new { p.Id, p.MapVersionId, p.NavigationFingerprint })
                .HasForeignKey(d => new { d.PoiProposalRevisionId, d.MapVersionId, d.PoiNavigationFingerprint })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisionStops_PoiMapFingerprint");

            entity.HasOne(d => d.PoiVerificationRecord).WithMany(p => p.RouteRevisionStops)
                .HasPrincipalKey(p => new { p.Id, p.MapVersionId, p.NavigationFingerprint })
                .HasForeignKey(d => new { d.SourcePoiVerificationRecordId, d.MapVersionId, d.PoiNavigationFingerprint })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisionStops_SourceEvidence");
        });

        modelBuilder.Entity<RouteRevisionSubmission>(entity =>
        {
            entity.HasIndex(e => new { e.SubmittedByUserId, e.RequestId }, "UQ_RouteRevisionSubmissions_Request").IsUnique();

            entity.HasIndex(e => e.RouteRevisionId, "UQ_RouteRevisionSubmissions_Revision").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.SubmittedAt).HasPrecision(3);

            entity.HasOne(d => d.RouteRevision).WithOne(p => p.RouteRevisionSubmission)
                .HasForeignKey<RouteRevisionSubmission>(d => d.RouteRevisionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisionSubmissions_Revision");

            entity.HasOne(d => d.SubmittedByUser).WithMany(p => p.RouteRevisionSubmissions)
                .HasForeignKey(d => d.SubmittedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteRevisionSubmissions_User");
        });

        modelBuilder.Entity<RouteStop>(entity =>
        {
            entity.HasIndex(e => new { e.RouteId, e.StopOrder }, "UQ_RouteStops_Order").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();

            entity.HasOne(d => d.Poi).WithMany(p => p.RouteStops)
                .HasForeignKey(d => d.PoiId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteStops_PoiId");

            entity.HasOne(d => d.Route).WithMany(p => p.RouteStops)
                .HasForeignKey(d => d.RouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteStops_RouteId");
        });

        modelBuilder.Entity<RouteTestRun>(entity =>
        {
            entity.HasIndex(e => new { e.RouteRevisionId, e.NavigationFingerprint, e.CheckedAt, e.Id }, "IX_RouteTestRuns_Effective").IsDescending(false, false, true, false);

            entity.HasIndex(e => new { e.CheckedByUserId, e.RequestId }, "UQ_RouteTestRuns_Request").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CheckedAt).HasPrecision(3);
            entity.Property(e => e.EvidenceNote).HasMaxLength(2000);
            entity.Property(e => e.FailureReason).HasMaxLength(1000);
            entity.Property(e => e.MeasurementBasis).HasMaxLength(32);
            entity.Property(e => e.MapPackageSha256)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.NavigationFingerprint)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.RequestHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.ResultCode)
                .HasMaxLength(10)
                .IsUnicode(false);

            entity.HasOne(d => d.CheckedByUser).WithMany(p => p.RouteTestRunCheckedByUsers)
                .HasForeignKey(d => d.CheckedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteTestRuns_Checker");

            entity.HasOne(d => d.ParticipatingStaffUser).WithMany(p => p.RouteTestRunParticipatingStaffUsers)
                .HasForeignKey(d => d.ParticipatingStaffUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteTestRuns_Staff");

            entity.HasOne(d => d.Robot).WithMany(p => p.RouteTestRuns)
                .HasForeignKey(d => d.RobotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteTestRuns_Robot");

            entity.HasOne(d => d.MapDeploymentCheck).WithMany(p => p.RouteTestRuns)
                .HasPrincipalKey(p => new { p.Id, p.MapVersionId, p.PackageSha256 })
                .HasForeignKey(d => new { d.MapDeploymentCheckId, d.MapVersionId, d.MapPackageSha256 })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteTestRuns_Deployment");

            entity.HasOne(d => d.RouteRevision).WithMany(p => p.RouteTestRuns)
                .HasPrincipalKey(p => new { p.Id, p.MapVersionId, p.NavigationFingerprint })
                .HasForeignKey(d => new { d.RouteRevisionId, d.MapVersionId, d.NavigationFingerprint })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteTestRuns_ExactRevision");
        });

        modelBuilder.Entity<RouteVariant>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.BaseRoute).WithMany(p => p.RouteVariantBaseRoutes)
                .HasForeignKey(d => d.BaseRouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteVariants_BaseRouteId");

            entity.HasOne(d => d.BranchPointRouteStop).WithMany(p => p.RouteVariantBranchPointRouteStops)
                .HasForeignKey(d => d.BranchPointRouteStopId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteVariants_BranchPointRouteStopId");

            entity.HasOne(d => d.VariantBranchStop).WithMany(p => p.RouteVariantVariantBranchStops)
                .HasForeignKey(d => d.VariantBranchStopId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteVariants_VariantBranchStopId");

            entity.HasOne(d => d.VariantRoute).WithMany(p => p.RouteVariantVariantRoutes)
                .HasForeignKey(d => d.VariantRouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteVariants_VariantRouteId");
        });

        modelBuilder.Entity<TourRobotReservation>(entity =>
        {
            entity.HasIndex(e => new { e.RobotId, e.StartsAt, e.EndsAt }, "IX_TourRobotReservations_ActiveRobot").HasFilter("([ReleasedAt] IS NULL)");

            entity.HasIndex(e => e.TourId, "UX_TourRobotReservations_ActiveTour")
                .IsUnique()
                .HasFilter("([ReleasedAt] IS NULL)");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.EndsAt).HasPrecision(3);
            entity.Property(e => e.ReleasedAt).HasPrecision(3);
            entity.Property(e => e.ReservedAt).HasPrecision(3);
            entity.Property(e => e.StartsAt).HasPrecision(3);

            entity.HasOne(d => d.ReleasedByUser).WithMany(p => p.TourRobotReservationReleasedByUsers)
                .HasForeignKey(d => d.ReleasedByUserId)
                .HasConstraintName("FK_TourRobotReservations_ReleasedByUserId");

            entity.HasOne(d => d.ReservedByUser).WithMany(p => p.TourRobotReservationReservedByUsers)
                .HasForeignKey(d => d.ReservedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourRobotReservations_ReservedByUserId");

            entity.HasOne(d => d.Robot).WithMany(p => p.TourRobotReservations)
                .HasForeignKey(d => d.RobotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourRobotReservations_RobotId");

            entity.HasOne(d => d.RouteTestRun).WithMany(p => p.TourRobotReservations)
                .HasForeignKey(d => d.RouteTestRunId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourRobotReservations_RouteTestRunId");

            entity.HasOne(d => d.Tour).WithMany(p => p.TourRobotReservations)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourRobotReservations_TourId");
        });

        modelBuilder.Entity<Tour>(entity =>
        {
            entity.HasIndex(e => e.RouteRevisionId, "IX_Tours_RouteRevisionId").HasFilter("([RouteRevisionId] IS NOT NULL)");

            entity.HasOne(d => d.OperatorUser).WithMany(p => p.TourOperatorUsers)
                .HasForeignKey(d => d.OperatorUserId)
                .HasConstraintName("FK_Tours_OperatorUserId");

            entity.HasOne(d => d.RouteRevision).WithMany(p => p.Tours)
                .HasForeignKey(d => d.RouteRevisionId)
                .HasConstraintName("FK_Tours_RouteRevisionId");

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AssistanceReason)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.CurrentLegKind)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.CurrentStep)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.DwellDeadlineAt).HasPrecision(3);
            entity.Property(e => e.EndReason).HasMaxLength(1000);
            entity.Property(e => e.EndedAt).HasPrecision(3);
            entity.Property(e => e.FallbackVideoUrl).HasMaxLength(1000);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.OperationalStatus)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.ScheduledStartAt).HasPrecision(3);
            entity.Property(e => e.StartedAt).HasPrecision(3);
            entity.Property(e => e.State)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.StopVisitClosedAt).HasPrecision(3);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.ActiveRoute).WithMany(p => p.TourActiveRoutes)
                .HasForeignKey(d => d.ActiveRouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tours_ActiveRouteId");

            entity.HasOne(d => d.AssignedRobot).WithMany(p => p.Tours)
                .HasForeignKey(d => d.AssignedRobotId)
                .HasConstraintName("FK_Tours_AssignedRobotId");

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.Tours)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tours_CreatedByUserId");

            entity.HasOne(d => d.CurrentRevisionStop).WithMany(p => p.TourCurrentRevisionStops)
                .HasForeignKey(d => d.CurrentRevisionStopId)
                .HasConstraintName("FK_Tours_CurrentRevisionStopId");

            entity.HasOne(d => d.LastArrivedRevisionStop).WithMany(p => p.TourLastArrivedRevisionStops)
                .HasForeignKey(d => d.LastArrivedRevisionStopId)
                .HasConstraintName("FK_Tours_LastArrivedRevisionStopId");

            entity.HasOne(d => d.CurrentRouteStop).WithMany(p => p.TourCurrentRouteStops)
                .HasForeignKey(d => d.CurrentRouteStopId)
                .HasConstraintName("FK_Tours_CurrentRouteStopId");

            entity.HasOne(d => d.LastArrivedRouteStop).WithMany(p => p.TourLastArrivedRouteStops)
                .HasForeignKey(d => d.LastArrivedRouteStopId)
                .HasConstraintName("FK_Tours_LastArrivedRouteStopId");

            entity.HasOne(d => d.Route).WithMany(p => p.TourRoutes)
                .HasForeignKey(d => d.RouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tours_RouteId");
        });

        modelBuilder.Entity<TourAllowedBranch>(entity =>
        {
            entity.HasIndex(e => new { e.TourId, e.RouteVariantId }, "UQ_TourAllowedBranches_Variant").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.RouteVariant).WithMany(p => p.TourAllowedBranches)
                .HasForeignKey(d => d.RouteVariantId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourAllowedBranches_RouteVariantId");

            entity.HasOne(d => d.Tour).WithMany(p => p.TourAllowedBranches)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourAllowedBranches_TourId");
        });

        modelBuilder.Entity<TourEvent>(entity =>
        {
            entity.Property(e => e.EventType).HasMaxLength(80);
            entity.Property(e => e.LegKind)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.OccurredAt).HasPrecision(3);
            entity.Property(e => e.ReasonCode).HasMaxLength(100);
            entity.Property(e => e.ReasonNote).HasMaxLength(2000);
            entity.Property(e => e.TargetMapFrame).HasMaxLength(100);
            entity.Property(e => e.TargetMapKey).HasMaxLength(100);
            entity.Property(e => e.TargetX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.TargetY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.TargetYaw).HasColumnType("decimal(9, 6)");

            entity.HasOne(d => d.ActorUser).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.ActorUserId)
                .HasConstraintName("FK_TourEvents_ActorUserId");

            entity.HasOne(d => d.Robot).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.RobotId)
                .HasConstraintName("FK_TourEvents_RobotId");

            entity.HasOne(d => d.Route).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.RouteId)
                .HasConstraintName("FK_TourEvents_RouteId");

            entity.HasOne(d => d.TargetPoi).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.TargetPoiId)
                .HasConstraintName("FK_TourEvents_TargetPoiId");

            entity.HasOne(d => d.Tour).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourEvents_TourId");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.NormalizedUsername, "UQ_Users_NormalizedUsername").IsUnique();

            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.FullName).HasMaxLength(150);
            entity.Property(e => e.NormalizedUsername).HasMaxLength(100);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);
            entity.Property(e => e.Username).HasMaxLength(100);
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.Role });

            entity.Property(e => e.Role)
                .HasMaxLength(32)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithMany(p => p.UserRoles)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserRoles_UserId");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
