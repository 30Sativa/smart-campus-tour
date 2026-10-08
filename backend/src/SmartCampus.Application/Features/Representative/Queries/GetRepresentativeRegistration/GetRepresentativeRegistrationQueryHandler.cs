using SmartCampus.Application.Features.Representative.Commands;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration;

public sealed class GetRepresentativeRegistrationQueryHandler(IRepresentativeRepository repository)
    : IRequestHandler<GetRepresentativeRegistrationQuery, RegistrationDetails>
{
    public async Task<RegistrationDetails> Handle(GetRepresentativeRegistrationQuery query, CancellationToken ct)
    {
        var registration = await repository.GetRegistrationAsync(query.Id, query.Owner, ct)
            ?? throw new NotFoundException("Không tìm thấy dữ liệu.");
        return new(registration.Summary,
        registration.ContactName, registration.ContactEmail, Convert.ToBase64String(registration.RowVersion),
        Convert.ToBase64String(registration.TourRowVersion), registration.RejectionReason, registration.ReviewedAt, registration.Roster,
        RepresentativeRegistrationPolicy.Actions(registration.Summary.TourState, registration.Summary.State, registration.HasInvitations));
    }
}
