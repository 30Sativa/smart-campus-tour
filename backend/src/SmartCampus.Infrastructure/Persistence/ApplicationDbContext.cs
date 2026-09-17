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

    public virtual DbSet<Booking> Bookings { get; set; }

    public virtual DbSet<Feedback> Feedbacks { get; set; }

    public virtual DbSet<Poi> Pois { get; set; }

    public virtual DbSet<RefreshToken> RefreshTokens { get; set; }

    public virtual DbSet<Robot> Robots { get; set; }

    public virtual DbSet<Route> Routes { get; set; }

    public virtual DbSet<RouteStop> RouteStops { get; set; }

    public virtual DbSet<SystemConfig> SystemConfigs { get; set; }

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
            entity.Property(e => e.OccurredAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_AuditLogs_OccurredAt");

            entity.HasOne(d => d.ActorUser).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.ActorUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AuditLogs_Users");
        });

        modelBuilder.Entity<Booking>(entity =>
        {
            entity.HasIndex(e => new { e.TourId, e.Id }, "UX_Bookings_Tour_Id").IsUnique();

            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_Bookings_Id");
            entity.Property(e => e.BookedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Bookings_BookedAt");
            entity.Property(e => e.CancelledAt).HasPrecision(3);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("CONFIRMED", "DF_Bookings_Status");
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.Tour).WithMany(p => p.Bookings)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Bookings_Tours");

            entity.HasOne(d => d.VisitorUser).WithMany(p => p.Bookings)
                .HasForeignKey(d => d.VisitorUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Bookings_Users");
        });

        modelBuilder.Entity<Feedback>(entity =>
        {
            entity.HasKey(e => e.BookingId);

            entity.ToTable("Feedback");

            entity.Property(e => e.BookingId).ValueGeneratedNever();
            entity.Property(e => e.Comment).HasMaxLength(2000);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Feedback_CreatedAt");

            entity.HasOne(d => d.Booking).WithOne(p => p.Feedback)
                .HasForeignKey<Feedback>(d => d.BookingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Feedback_Bookings");
        });

        modelBuilder.Entity<Poi>(entity =>
        {
            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_Pois_Id");
            entity.Property(e => e.AudioEnUrl).HasMaxLength(1000);
            entity.Property(e => e.AudioViUrl).HasMaxLength(1000);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Pois_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.IsActive).HasDefaultValue(true, "DF_Pois_IsActive");
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);
            entity.Property(e => e.X).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Y).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.Yaw).HasColumnType("decimal(9, 6)");
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_RefreshTokens_Id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_RefreshTokens_CreatedAt");
            entity.Property(e => e.ExpiresAt).HasPrecision(3);
            entity.Property(e => e.RevokedAt).HasPrecision(3);

            entity.HasOne(d => d.User).WithMany(p => p.RefreshTokens)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RefreshTokens_Users");
        });

        modelBuilder.Entity<Robot>(entity =>
        {
            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_Robots_Id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Robots_CreatedAt");
            entity.Property(e => e.CredentialHash).HasMaxLength(256);
            entity.Property(e => e.DisplayName).HasMaxLength(150);
            entity.Property(e => e.IsDispatchEnabled).HasDefaultValue(true, "DF_Robots_IsDispatchEnabled");
            entity.Property(e => e.LastAssignedAt).HasPrecision(3);
            entity.Property(e => e.RobotCode).HasMaxLength(100);
            entity.Property(e => e.SourceType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.CurrentTour).WithMany(p => p.Robots)
                .HasForeignKey(d => d.CurrentTourId)
                .HasConstraintName("FK_Robots_CurrentTour");
        });

        modelBuilder.Entity<Route>(entity =>
        {
            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_Routes_Id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Routes_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.IsActive).HasDefaultValue(true, "DF_Routes_IsActive");
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.UpdatedAt).HasPrecision(3);
        });

        modelBuilder.Entity<RouteStop>(entity =>
        {
            entity.HasIndex(e => new { e.RouteId, e.StopOrder }, "UQ_RouteStops_Route_StopOrder").IsUnique();

            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_RouteStops_Id");

            entity.HasOne(d => d.Poi).WithMany(p => p.RouteStops)
                .HasForeignKey(d => d.PoiId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteStops_Pois");

            entity.HasOne(d => d.Route).WithMany(p => p.RouteStops)
                .HasForeignKey(d => d.RouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RouteStops_Routes");
        });

        modelBuilder.Entity<SystemConfig>(entity =>
        {
            entity.ToTable("SystemConfig");

            entity.Property(e => e.MeetingPointX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.MeetingPointY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.MeetingPointYaw).HasColumnType("decimal(9, 6)");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_SystemConfig_UpdatedAt");
        });

        modelBuilder.Entity<Tour>(entity =>
        {
            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_Tours_Id");
            entity.Property(e => e.ActualStartedAt).HasPrecision(3);
            entity.Property(e => e.CancelledAt).HasPrecision(3);
            entity.Property(e => e.CompletedAt).HasPrecision(3);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Tours_CreatedAt");
            entity.Property(e => e.NarrationLanguage)
                .HasMaxLength(2)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.RobotArrivedMeetingAt).HasPrecision(3);
            entity.Property(e => e.ScheduledStartAt).HasPrecision(3);
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("SCHEDULED", "DF_Tours_Status");
            entity.Property(e => e.UpdatedAt).HasPrecision(3);

            entity.HasOne(d => d.CurrentRobot).WithMany(p => p.Tours)
                .HasForeignKey(d => d.CurrentRobotId)
                .HasConstraintName("FK_Tours_CurrentRobot");

            entity.HasOne(d => d.Route).WithMany(p => p.Tours)
                .HasForeignKey(d => d.RouteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tours_Routes");

            entity.HasOne(d => d.Booking).WithMany(p => p.Tours)
                .HasPrincipalKey(p => new { p.TourId, p.Id })
                .HasForeignKey(d => new { d.Id, d.RepresentativeBookingId })
                .HasConstraintName("FK_Tours_RepresentativeBooking");
        });

        modelBuilder.Entity<TourEvent>(entity =>
        {
            entity.Property(e => e.EventType).HasMaxLength(80);
            entity.Property(e => e.LegKind).HasMaxLength(30);
            entity.Property(e => e.OccurredAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_TourEvents_OccurredAt");
            entity.Property(e => e.ReasonCode).HasMaxLength(100);
            entity.Property(e => e.ReasonNote).HasMaxLength(2000);
            entity.Property(e => e.TargetX).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.TargetY).HasColumnType("decimal(10, 4)");
            entity.Property(e => e.TargetYaw).HasColumnType("decimal(9, 6)");

            entity.HasOne(d => d.ActorUser).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.ActorUserId)
                .HasConstraintName("FK_TourEvents_Users");

            entity.HasOne(d => d.Robot).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.RobotId)
                .HasConstraintName("FK_TourEvents_Robots");

            entity.HasOne(d => d.TargetPoi).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.TargetPoiId)
                .HasConstraintName("FK_TourEvents_Pois");

            entity.HasOne(d => d.Tour).WithMany(p => p.TourEvents)
                .HasForeignKey(d => d.TourId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TourEvents_Tours");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(e => e.Id).HasDefaultValueSql("(newsequentialid())", "DF_Users_Id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(todatetimeoffset(sysutcdatetime(),'+00:00'))", "DF_Users_CreatedAt");
            entity.Property(e => e.FullName).HasMaxLength(150);
            entity.Property(e => e.IsActive).HasDefaultValue(true, "DF_Users_IsActive");
            entity.Property(e => e.Username).HasMaxLength(100);
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.Role });

            entity.Property(e => e.Role).HasMaxLength(20);

            entity.HasOne(d => d.User).WithMany(p => p.UserRoles)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserRoles_Users");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
