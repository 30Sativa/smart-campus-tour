using FluentValidation;

namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount;

public sealed class CreateAccountCommandValidator : AbstractValidator<CreateAccountCommand>
{
    public CreateAccountCommandValidator()
    {
        RuleFor(command => command.Username)
            .NotEmpty()
            .MaximumLength(100);
        RuleFor(command => command.FullName)
            .NotEmpty()
            .MaximumLength(150);
        RuleFor(command => command.Role)
            .Must(AccountRoles.IsCreatable)
            .WithMessage("Role must be Staff or Representative.");
        RuleFor(command => command.InitialPassword).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
    }
}
