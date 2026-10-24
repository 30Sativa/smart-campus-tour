using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

// A detail projection must not pair a new decision token with an older roster.
// Retain an update lock on the Tour before reading its registration/rows; writers
// use the same Tour-first order. No tracking or SaveChanges is involved.
internal static class RegistrationReadSnapshot
{
    /// <summary>Returns null when the registration does not exist or is not owned by a non-null <paramref name="owner"/>.</summary>
    public static async Task<IDbContextTransaction?> BeginAsync(ApplicationDbContext context, Guid registrationId,
        Guid? owner, CancellationToken ct)
    {
        var tourId = await context.GroupRegistrations.AsNoTracking()
            .Where(r => r.Id == registrationId && (owner == null || r.RepresentativeUserId == owner))
            .Select(r => (Guid?)r.TourId).SingleOrDefaultAsync(ct);
        if (tourId is null) return null;
        return await ForTourAsync(context, tourId.Value, ct);
    }

    internal static async Task<IDbContextTransaction> ForTourAsync(ApplicationDbContext context, Guid tourId, CancellationToken ct)
    {
        var transaction = await context.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        try
        {
            _ = await context.Tours.FromSqlInterpolated($"SELECT * FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id = {tourId}")
                .AsNoTracking().SingleOrDefaultAsync(ct);
            return transaction;
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }
}
