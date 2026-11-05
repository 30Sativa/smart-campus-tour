using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;

public sealed class GetTourStartChecksQueryHandler(ITourManagementRepository repository, TourStartPreflight preflight)
    : IRequestHandler<GetTourStartChecksQuery, TourStartChecks>
{
    public async Task<TourStartChecks> Handle(GetTourStartChecksQuery query, CancellationToken ct)
    {
        await using var snapshot = await repository.BeginReadAsync(query.Id, ct);
        var tour = await repository.FindAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        // The same checks Start runs, without its locks; Start rechecks them all.
        return await preflight.EvaluateAsync(tour, query.Viewer, null, includeConfirmation: false, lockTarget: false, ct);
    }
}
