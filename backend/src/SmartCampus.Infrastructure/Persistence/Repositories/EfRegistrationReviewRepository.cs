using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfRegistrationReviewRepository(ApplicationDbContext context) : IRegistrationReviewRepository
{
    private static readonly Expression<Func<GroupRegistration, ReviewListItem>> Summary = r =>
        new(r.Id, r.TourId, r.Tour.Name, r.Tour.ScheduledStartAt, r.Tour.State, r.SchoolName, r.GroupName,
            r.State, r.RosterRows.Count(row => row.IsActive), r.RepresentativeUser.FullName,
            r.SubmittedAt, r.UpdatedAt ?? r.CreatedAt);

    public async Task<PagedResult<ReviewListItem>> ListAsync(ReviewListRequest request, CancellationToken ct)
    {
        var query = context.GroupRegistrations.AsNoTracking();
        if (request.TourId is not null) query = query.Where(r => r.TourId == request.TourId);
        if (request.State is not null) query = query.Where(r => r.State == request.State);
        if (request.From is not null) query = query.Where(r => r.Tour.ScheduledStartAt >= request.From);
        if (request.To is not null) query = query.Where(r => r.Tour.ScheduledStartAt < request.To);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(r => r.SchoolName.Contains(search) || r.GroupName.Contains(search) ||
                r.RepresentativeUser.FullName.Contains(search) || r.Tour.Name.Contains(search));
        }
        var total = await query.LongCountAsync(ct);
        query = request.Sort switch
        {
            "groupName" => query.OrderBy(r => r.GroupName).ThenBy(r => r.Id),
            "-groupName" => query.OrderByDescending(r => r.GroupName).ThenBy(r => r.Id),
            "updatedAt" => query.OrderBy(r => r.UpdatedAt ?? r.CreatedAt).ThenBy(r => r.Id),
            "-updatedAt" => query.OrderByDescending(r => r.UpdatedAt ?? r.CreatedAt).ThenBy(r => r.Id),
            "-submittedAt" => query.OrderByDescending(r => r.SubmittedAt).ThenBy(r => r.Id),
            _ => query.OrderBy(r => r.SubmittedAt).ThenBy(r => r.Id)
        };
        var offset = (int)Math.Min((long)(request.Page - 1) * request.Size, int.MaxValue);
        return new(await query.Skip(offset).Take(request.Size).Select(Summary).ToArrayAsync(ct), request.Page, request.Size, total);
    }

    public async Task<ReviewReadModel?> GetAsync(Guid id, CancellationToken ct)
    {
        await using var snapshot = await RegistrationReadSnapshot.BeginAsync(context, id, owner: null, ct);
        if (snapshot is null) return null;
        var read = await context.GroupRegistrations.AsNoTracking().Where(r => r.Id == id).Select(r => new
        {
            Summary = new ReviewListItem(r.Id, r.TourId, r.Tour.Name, r.Tour.ScheduledStartAt, r.Tour.State,
                r.SchoolName, r.GroupName, r.State, r.RosterRows.Count(row => row.IsActive), r.RepresentativeUser.FullName,
                r.SubmittedAt, r.UpdatedAt ?? r.CreatedAt),
            r.ContactName, r.ContactEmail, r.RowVersion, TourVersion = r.Tour.RowVersion,
            r.RejectionReason, r.ReviewedAt, r.ReviewedByUserId,
            HasInvitations = r.RosterRows.Any(row => row.Invitation != null),
            Rows = r.RosterRows.Where(row => row.IsActive).OrderBy(row => row.RowNumber)
                .Select(row => new { row.Id, row.RowNumber, row.RowType, row.DisplayName, row.Email, row.ClassName,
                    row.RowVersion, InvitationVersion = row.Invitation == null ? null : row.Invitation.RowVersion }).ToArray()
        }).SingleOrDefaultAsync(ct);
        return read is null ? null : new(read.Summary, read.ContactName, read.ContactEmail, read.RowVersion,
            read.TourVersion, read.RejectionReason, read.ReviewedAt, read.ReviewedByUserId,
            read.Rows.Select(row => new ReviewRosterRow(row.Id, row.RowNumber, row.RowType, row.DisplayName, row.Email,
                row.ClassName, RowVersionToken.Encode(row.RowVersion), row.InvitationVersion is null ? null : RowVersionToken.Encode(row.InvitationVersion))).ToArray(),
            read.HasInvitations);
    }
}
