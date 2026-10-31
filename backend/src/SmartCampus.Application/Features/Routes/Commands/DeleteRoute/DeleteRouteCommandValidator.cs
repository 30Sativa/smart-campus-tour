using FluentValidation;

namespace SmartCampus.Application.Features.Routes.Commands.DeleteRoute;

public sealed class DeleteRouteCommandValidator : AbstractValidator<DeleteRouteCommand>
{
    public DeleteRouteCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.ExpectedVersion).Must(LegacyRouteRevision.IsValid);
    }
}
