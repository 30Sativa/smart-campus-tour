using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.RosterEmailCorrection;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfRosterEmailChangeRepository(ApplicationDbContext context) : IRosterEmailChangeRepository
{
    public Task<Guid?> FindTourIdAsync(Guid requestEntityId, CancellationToken ct) => context.RosterEmailChangeRequests
        .AsNoTracking().Where(request => request.Id == requestEntityId)
        .Select(request => (Guid?)request.RosterRow.Registration.TourId).SingleOrDefaultAsync(ct);

    public Task<Guid?> FindRegistrationIdAsync(Guid requestEntityId, CancellationToken ct) => context.RosterEmailChangeRequests
        .AsNoTracking().Where(request => request.Id == requestEntityId)
        .Select(request => (Guid?)request.RosterRow.RegistrationId).SingleOrDefaultAsync(ct);

    public Task<RosterEmailChangeRequest?> FindByIdAsync(Guid id, CancellationToken ct) => context.RosterEmailChangeRequests
        .Include(request => request.RosterRow).ThenInclude(row => row.Registration).ThenInclude(registration => registration.Tour)
        .Include(request => request.RosterRow).ThenInclude(row => row.Invitation).ThenInclude(invitation => invitation!.BrowserSessions.Where(session => session.EndedAt == null))
        .SingleOrDefaultAsync(request => request.Id == id, ct);

    public Task<RosterEmailChangeRequest?> FindByRequesterRequestIdAsync(Guid requester, Guid requestId, CancellationToken ct) =>
        context.RosterEmailChangeRequests.AsNoTracking().SingleOrDefaultAsync(request =>
            request.RequestedByUserId == requester && request.RequestId == requestId, ct);

    public Task<RosterEmailChangeRequest?> FindPendingForRowAsync(Guid rowId, CancellationToken ct) =>
        context.RosterEmailChangeRequests.AsNoTracking().SingleOrDefaultAsync(request =>
            request.RosterRowId == rowId && request.State == "PENDING", ct);

    public async Task<bool> IsEmailReservedAsync(Guid tourId, Guid exceptRowId, string normalizedEmail, CancellationToken ct)
    {
        var rowReservation = await context.RosterRows.AnyAsync(row => row.Id != exceptRowId && row.IsActive &&
            row.Registration.TourId == tourId &&
            (row.ParticipationState == RosterParticipationStates.Pending || row.ParticipationState == RosterParticipationStates.Accepted) &&
            row.Email == normalizedEmail, ct);
        if (rowReservation) return true;
        return await context.RosterEmailChangeRequests.AnyAsync(request => request.RosterRowId != exceptRowId &&
            request.State == "PENDING" && request.RosterRow.IsActive &&
            request.RosterRow.Registration.TourId == tourId && request.ProposedEmail == normalizedEmail, ct);
    }

    public async Task<IReadOnlyList<RosterEmailChangeView>> ListAsync(Guid? registrationId, Guid? representativeOwner,
        string? state, CancellationToken ct)
    {
        var query = context.RosterEmailChangeRequests.AsNoTracking().AsQueryable();
        if (registrationId is not null) query = query.Where(request => request.RosterRow.RegistrationId == registrationId);
        if (representativeOwner is not null) query = query.Where(request => request.RosterRow.Registration.RepresentativeUserId == representativeOwner);
        if (!string.IsNullOrWhiteSpace(state)) query = query.Where(request => request.State == state);
        var rows = await query.OrderByDescending(request => request.CreatedAt).ThenBy(request => request.Id)
            .Select(request => new
            {
                request.Id, request.RosterRow.RegistrationId, RowId = request.RosterRowId, request.RosterRow.RowNumber,
                request.CurrentEmail, request.ProposedEmail, request.State, request.RequestedByUserId, request.CreatedAt,
                request.ReviewedAt, request.ReviewedByUserId, request.ReviewReason, request.RowVersion,
                TourStart = request.RosterRow.Registration.Tour.ScheduledStartAt,
                TourIsShortNotice = request.RosterRow.Registration.Tour.IsShortNotice,
                TourState = request.RosterRow.Registration.Tour.State, TourRowVersion = request.RosterRow.Registration.Tour.RowVersion,
                RegistrationRowVersion = request.RosterRow.Registration.RowVersion, RosterRowVersion = request.RosterRow.RowVersion
            }).ToArrayAsync(ct);
        return rows.Select(request => new RosterEmailChangeView(request.Id, request.RegistrationId, request.RowId,
            request.RowNumber, request.CurrentEmail, request.ProposedEmail, request.State, request.RequestedByUserId,
            request.CreatedAt, request.ReviewedAt, request.ReviewedByUserId, request.ReviewReason,
            RowVersionToken.Encode(request.RowVersion), RowVersionToken.Encode(request.TourRowVersion),
            RowVersionToken.Encode(request.RegistrationRowVersion), RowVersionToken.Encode(request.RosterRowVersion),
            request.TourState == "SCHEDULED" && request.State == "PENDING",
            SmartCampus.Application.Features.Tours.TourSchedule.ReviewClosesAt(request.TourStart, request.TourIsShortNotice))).ToArray();
    }

    public void Add(RosterEmailChangeRequest request) => context.RosterEmailChangeRequests.Add(request);
}
