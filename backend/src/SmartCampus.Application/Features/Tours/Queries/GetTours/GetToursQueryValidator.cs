using FluentValidation;

namespace SmartCampus.Application.Features.Tours.Queries.GetTours;

public sealed class GetToursQueryValidator : AbstractValidator<GetToursQuery>
{
    public const int MaxReadyBlockerPage = 10;

    public GetToursQueryValidator()
    {
        RuleFor(q => q.Request.Page).InclusiveBetween(1, 1_000_000);
        RuleFor(q => q.Request.Size).InclusiveBetween(1, 100);
        RuleFor(q => q.Request.Search).MaximumLength(200);
        RuleFor(q => q.Request.Sort).Must(s => s is "name" or "-name" or "scheduledStartAt" or "-scheduledStartAt" or "createdAt" or "-createdAt");
        RuleFor(q => q.Request.State).Must(s => s is null or "SCHEDULED" or "READY" or "RUNNING" or "COMPLETED" or "CANCELLED");
        RuleFor(q => q.Request.Phase).Must(p => p is null or TourPhases.Upcoming or TourPhases.Running or TourPhases.Finished);
        // READY is evaluated per SCHEDULED row (several reads each), so only a short page may ask for it.
        RuleFor(q => q.Request.Size).LessThanOrEqualTo(MaxReadyBlockerPage).When(q => q.Request.IncludeReadyBlockers)
            .WithMessage($"readyBlockers chỉ dùng với size tối đa {MaxReadyBlockerPage}.");
        RuleFor(q => q.Request).Must(r => !r.From.HasValue || !r.To.HasValue || r.From <= r.To)
            .WithMessage("From phải trước hoặc bằng To.");
    }
}
