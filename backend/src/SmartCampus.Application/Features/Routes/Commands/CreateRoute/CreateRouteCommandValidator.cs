using FluentValidation;

namespace SmartCampus.Application.Features.Routes.Commands.CreateRoute;

public sealed class CreateRouteCommandValidator : AbstractValidator<CreateRouteCommand>
{
    public CreateRouteCommandValidator()
    {
        RuleFor(c => c.ActorUserId).NotEmpty();
        RuleFor(c => c.Input).NotNull().SetValidator(new RouteInputValidator());
    }
}
