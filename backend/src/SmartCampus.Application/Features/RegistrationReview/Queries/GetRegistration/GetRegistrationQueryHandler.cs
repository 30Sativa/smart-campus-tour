using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed class GetRegistrationQueryHandler(IRegistrationReviewRepository repository)
    : IRequestHandler<GetRegistrationQuery, ReviewDetails>
{
    public async Task<ReviewDetails> Handle(GetRegistrationQuery query, CancellationToken ct)
    {
        var read = await repository.GetAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        return new(read.Summary, read.ContactName, read.ContactEmail, Convert.ToBase64String(read.RowVersion),
            Convert.ToBase64String(read.TourRowVersion), read.RejectionReason, read.ReviewedAt, read.ReviewedByUserId,
            read.Roster, ReviewPolicy.Gate(read.Summary.TourState, read.Summary.State, read.HasInvitations));
    }
}
