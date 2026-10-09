using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed class GetRegistrationQueryHandler(IRegistrationReviewRepository repository)
    : IRequestHandler<GetRegistrationQuery, ReviewDetails>
{
    public async Task<ReviewDetails> Handle(GetRegistrationQuery query, CancellationToken ct)
    {
        var read = await repository.GetAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        return new(read.Summary, read.ContactName, read.ContactEmail, RowVersionToken.Encode(read.RowVersion),
            RowVersionToken.Encode(read.TourRowVersion), read.RejectionReason, read.ReviewedAt, read.ReviewedByUserId,
            read.Roster, ReviewPolicy.Evaluate(read.Summary.TourState, read.Summary.State, read.HasInvitations).ToActionGate());
    }
}
