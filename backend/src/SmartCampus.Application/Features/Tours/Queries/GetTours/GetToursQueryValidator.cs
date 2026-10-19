using FluentValidation;

namespace SmartCampus.Application.Features.Tours.Queries.GetTours;

public sealed class GetToursQueryValidator : AbstractValidator<GetToursQuery>
{
    public GetToursQueryValidator()
    {
        RuleFor(q => q.Request.Page).InclusiveBetween(1, 1_000_000);
        RuleFor(q => q.Request.Size).InclusiveBetween(1, 100);
        RuleFor(q => q.Request.Search).MaximumLength(200);
        RuleFor(q => q.Request.Sort).Must(s => s is "name" or "-name" or "scheduledStartAt" or "-scheduledStartAt" or "createdAt" or "-createdAt");
        RuleFor(q => q.Request.State).Must(s => s is null or "SCHEDULED" or "READY" or "RUNNING" or "COMPLETED" or "CANCELLED");
        RuleFor(q => q.Request).Must(r => !r.From.HasValue || !r.To.HasValue || r.From <= r.To)
            .WithMessage("From phải trước hoặc bằng To.");
    }
}
