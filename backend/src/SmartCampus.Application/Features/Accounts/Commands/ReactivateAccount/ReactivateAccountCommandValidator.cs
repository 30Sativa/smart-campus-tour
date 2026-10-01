using FluentValidation;

namespace SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;

public sealed class ReactivateAccountCommandValidator : AbstractValidator<ReactivateAccountCommand>
{
    public ReactivateAccountCommandValidator()
    {
        RuleFor(command => command.Id).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
    }
}
