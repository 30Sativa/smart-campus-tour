using FluentValidation;

namespace SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;

public sealed class DeactivateAccountCommandValidator : AbstractValidator<DeactivateAccountCommand>
{
    public DeactivateAccountCommandValidator()
    {
        RuleFor(command => command.Id).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
    }
}
