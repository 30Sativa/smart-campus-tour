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

    public virtual DbSet<GroupRegistration> GroupRegistrations { get; set; }

    public virtual DbSet<Poi> Pois { get; set; }

    public virtual DbSet<RefreshToken> RefreshTokens { get; set; }

    public virtual DbSet<Robot> Robots { get; set; }

    public virtual DbSet<RosterRow> RosterRows { get; set; }

    public virtual DbSet<Route> Routes { get; set; }

    public virtual DbSet<RouteStop> RouteStops { get; set; }

    public virtual DbSet<Tour> Tours { get; set; }

    public virtual DbSet<TourEvent> TourEvents { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserRole> UserRoles { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.Property(e => e.Action).HasMaxLength(50);
            entity.Property(e => e.EntityId).HasMaxLength(100);
            entity.Property(e => e.EntityType).HasMaxLength(50);
            entity.Property(e => e.OccurredAt).HasPrecision(3);

            entity.HasOne(d => d.ActorUser).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.ActorUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AuditLogs_ActorUserId");
        });

        modelBuilder.Entity<GroupRegistration>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CancelledAt).HasPrecision(3);
            entity.Property(e => e.ContactEmail).HasMaxLength(254);
            entity.Property(e => e.ContactName).HasMaxLength(150);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.GroupCodeHash)
                .HasMaxLength(32)
                .IsFixedLength();
            entity.Property(e => e.InvitationSentAt).HasPrecision(3);
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

        modelBuilder.Entity<Poi>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.AudioUrl).HasMaxLength(1000);
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.MapFrame).HasMaxLength(100);
            entity.Property(e => e.MapKey).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);
            entity.Property(e => e.X).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Y).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Yaw).HasColumnType("decimal(9, 6)");
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
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
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.CreatedAt).HasPrecision(3);
            entity.Property(e => e.CredentialHash).HasMaxLength(256);
            entity.Property(e => e.DisplayName).HasMaxLength(150);
            entity.Property(e => e.LastAssignedAt).HasPrecision(3);
            entity.Property(e => e.RobotCode).HasMaxLength(100);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.SourceType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.CurrentTour).WithMany(p => p.Robots)
                .HasForeignKey(d => d.CurrentTourId)
                .HasConstraintName("FK_Robots_CurrentTourId");
        });

        modelBuilder.Entity<RosterRow>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
            entity.Property(e => e.ClassName).HasMaxLength(100);
            entity.Property(e => e.FullName).HasMaxLength(150);
            entity.Property(e => e.NormalizedClassName).HasMaxLength(100);
            entity.Property(e => e.NormalizedFullName).HasMaxLength(150);

            entity.HasOne(d => d.Registration).WithMany(p => p.RosterRows)
                .HasForeignKey(d => d.RegistrationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RosterRows_RegistrationId");
        });

        modelBuilder.Entity<Route>(entity =>
        {
            entity.Property(e => e.Id).ValueGeneratedNever();
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

        modelBuilder.Entity<RouteStop>(entity =>
        {
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

        modelBuilder.Entity<Tour>(entity =>
        {
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

            entity.HasOne(d => d.AssignedRobot).WithMany(p => p.Tours)
                .HasForeignKey(d => d.AssignedRobotId)
                .HasConstraintName("FK_Tours_AssignedRobotId");

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.Tours)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tours_CreatedByUserId");

            entity.HasOne(d => d.Route).WithMany(p => p.Tours)
                .HasForeignKey(d => d.RouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tours_RouteId");
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
