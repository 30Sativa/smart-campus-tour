using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
        public DbSet<Route> Routes => Set<Route>();
        public DbSet<Waypoint> Waypoints => Set<Waypoint>();
        public DbSet<POI> POIs => Set<POI>();
        public DbSet<TimeSlot> TimeSlots => Set<TimeSlot>();
        public DbSet<Booking> Bookings => Set<Booking>();
        public DbSet<TourSession> TourSessions => Set<TourSession>();
        public DbSet<AMRUnit> AMRUnits => Set<AMRUnit>();
        public DbSet<Mission> Missions => Set<Mission>();
        public DbSet<AMRAssignment> AMRAssignments => Set<AMRAssignment>();
        public DbSet<OperationalAlert> OperationalAlerts => Set<OperationalAlert>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
        public DbSet<TourTimelineEvent> TourTimelineEvents => Set<TourTimelineEvent>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Route
            modelBuilder.Entity<Route>()
                .Property(r => r.Status)
                .HasConversion<string>();

            // Waypoint → Route
            modelBuilder.Entity<Waypoint>()
                .HasOne(w => w.Route)
                .WithMany(r => r.Waypoints)
                .HasForeignKey(w => w.RouteId)
                .OnDelete(DeleteBehavior.Cascade);

            // POI → Waypoint (1-to-1)
            modelBuilder.Entity<POI>()
                .HasOne(p => p.Waypoint)
                .WithOne(w => w.POI)
                .HasForeignKey<POI>(p => p.WaypointId)
                .OnDelete(DeleteBehavior.Cascade);

            // TimeSlot → Route
            modelBuilder.Entity<TimeSlot>()
                .Property(t => t.Status).HasConversion<string>();
            modelBuilder.Entity<TimeSlot>()
                .HasOne(t => t.Route)
                .WithMany(r => r.TimeSlots)
                .HasForeignKey(t => t.RouteId)
                .OnDelete(DeleteBehavior.Cascade);
            // Ignore computed property
            modelBuilder.Entity<TimeSlot>()
                .Ignore(t => t.BookedCount)
                .Ignore(t => t.IsFull);

            // Booking → User, TimeSlot
            modelBuilder.Entity<Booking>()
                .Property(b => b.Status).HasConversion<string>();
            modelBuilder.Entity<Booking>()
                .HasOne(b => b.User)
                .WithMany()
                .HasForeignKey(b => b.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<Booking>()
                .HasOne(b => b.Slot)
                .WithMany(s => s.Bookings)
                .HasForeignKey(b => b.SlotId)
                .OnDelete(DeleteBehavior.Restrict);

            // TourSession → Booking
            modelBuilder.Entity<TourSession>()
                .Property(s => s.Status).HasConversion<string>();
            modelBuilder.Entity<TourSession>()
                .HasOne(s => s.Booking)
                .WithOne(b => b.Session)
                .HasForeignKey<TourSession>(s => s.BookingId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TourSession>()
                .HasOne(s => s.AssignedAMR)
                .WithMany()
                .HasForeignKey(s => s.AssignedAMRId)
                .OnDelete(DeleteBehavior.SetNull);

            // AMRUnit
            modelBuilder.Entity<AMRUnit>()
                .Property(a => a.Status).HasConversion<string>();

            // Operational records
            modelBuilder.Entity<Mission>().Property(m => m.State).HasConversion<string>();
            modelBuilder.Entity<Mission>()
                .HasOne(m => m.TourSession)
                .WithMany(s => s.Missions)
                .HasForeignKey(m => m.TourSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<Mission>()
                .HasOne(m => m.AMRUnit)
                .WithMany()
                .HasForeignKey(m => m.AMRUnitId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<Mission>()
                .HasOne(m => m.CurrentWaypoint)
                .WithMany()
                .HasForeignKey(m => m.CurrentWaypointId)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<Mission>()
                .HasOne(m => m.NextWaypoint)
                .WithMany()
                .HasForeignKey(m => m.NextWaypointId)
                .OnDelete(DeleteBehavior.NoAction);

            modelBuilder.Entity<AMRAssignment>().Property(a => a.Status).HasConversion<string>();
            modelBuilder.Entity<AMRAssignment>()
                .HasOne(a => a.TourSession)
                .WithMany(s => s.Assignments)
                .HasForeignKey(a => a.TourSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<AMRAssignment>()
                .HasOne(a => a.AMRUnit)
                .WithMany()
                .HasForeignKey(a => a.AMRUnitId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<AMRAssignment>()
                .HasOne(a => a.AssignedByUser)
                .WithMany()
                .HasForeignKey(a => a.AssignedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<AMRAssignment>()
                .HasIndex(a => new { a.TourSessionId, a.Status })
                .HasFilter("[Status] = 'Active'")
                .IsUnique();

            modelBuilder.Entity<OperationalAlert>().Property(a => a.Type).HasConversion<string>();
            modelBuilder.Entity<OperationalAlert>().Property(a => a.Severity).HasConversion<string>();
            modelBuilder.Entity<OperationalAlert>()
                .HasOne(a => a.AMRUnit)
                .WithMany()
                .HasForeignKey(a => a.AMRUnitId)
                .OnDelete(DeleteBehavior.SetNull);
            modelBuilder.Entity<OperationalAlert>()
                .HasOne(a => a.TourSession)
                .WithMany(s => s.Alerts)
                .HasForeignKey(a => a.TourSessionId)
                .OnDelete(DeleteBehavior.SetNull);
            modelBuilder.Entity<OperationalAlert>()
                .HasOne(a => a.AcknowledgedByUser)
                .WithMany()
                .HasForeignKey(a => a.AcknowledgedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            modelBuilder.Entity<AuditLog>()
                .HasOne(a => a.ActorUser)
                .WithMany()
                .HasForeignKey(a => a.ActorUserId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<AuditLog>().HasIndex(a => new { a.TargetType, a.TargetId, a.CreatedAt });
            modelBuilder.Entity<AuditLog>().HasIndex(a => a.CorrelationId);

            modelBuilder.Entity<TourTimelineEvent>().Property(e => e.Type).HasConversion<string>();
            modelBuilder.Entity<TourTimelineEvent>()
                .HasOne(e => e.TourSession)
                .WithMany(s => s.TimelineEvents)
                .HasForeignKey(e => e.TourSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TourTimelineEvent>().HasIndex(e => new { e.TourSessionId, e.OccurredAt });
        }
    }
}
