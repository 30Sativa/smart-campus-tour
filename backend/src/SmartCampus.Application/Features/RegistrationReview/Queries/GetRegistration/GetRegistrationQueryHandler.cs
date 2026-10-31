using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Features.RosterEmailCorrection;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed class GetRegistrationQueryHandler(IRegistrationReviewRepository repository, InvitationSettings settings)
    : IRequestHandler<GetRegistrationQuery, ReviewDetails>
{
    public async Task<ReviewDetails> Handle(GetRegistrationQuery query, CancellationToken ct)
    {
        var read = await repository.GetAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy đăng ký.");
        var aggregateReview = read.Roster.Count(row => row.ParticipationState == RosterParticipationStates.Pending) == 1 &&
            read.Roster.Count == 1
            ? ReviewPolicy.Evaluate(read.Summary.TourState, read.Summary.State, read.HasInvitations).ToActionGate()
            : new ActionGate(false, "Duyệt từng dòng bằng action của row.");
        return new(read.Summary, read.ContactName, read.ContactEmail, RowVersionToken.Encode(read.RowVersion),
            RowVersionToken.Encode(read.TourRowVersion), read.RejectionReason, read.ReviewedAt, read.ReviewedByUserId,
            read.Roster, aggregateReview,
            EmailCorrectionPolicy.Evaluate(read.Summary.TourState, read.Summary.State, read.HasInvitations, settings.Enabled).ToActionGate());
    }
}
