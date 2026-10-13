using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration;

public sealed class GetRepresentativeRegistrationQueryHandler(IRepresentativeRepository repository)
    : IRequestHandler<GetRepresentativeRegistrationQuery, RegistrationDetails>
{
    public async Task<RegistrationDetails> Handle(GetRepresentativeRegistrationQuery query, CancellationToken ct)
    {
        var read = await repository.GetRegistrationAsync(query.Id, query.Owner, ct)
            ?? throw new NotFoundException("Không tìm thấy dữ liệu.");
        // The same policy the commands enforce, projected for the client.
        ActionGate Gate(RegistrationOperation operation) => RepresentativeRegistrationPolicy
            .Evaluate(read.Summary.TourState, read.Summary.State, read.HasInvitations, operation).ToActionGate();
        return new(read.Summary, read.ContactName, read.ContactEmail, RowVersionToken.Encode(read.RowVersion),
            RowVersionToken.Encode(read.TourRowVersion), read.RejectionReason, read.ReviewedAt, read.Roster,
            new RegistrationActions(Gate(RegistrationOperation.Update), Gate(RegistrationOperation.Resubmit),
                Gate(RegistrationOperation.Cancel)));
    }
}
