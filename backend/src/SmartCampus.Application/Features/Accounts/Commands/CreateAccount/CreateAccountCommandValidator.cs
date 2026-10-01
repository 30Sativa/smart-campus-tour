using FluentValidation;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount;

public sealed class CreateAccountCommandValidator : AbstractValidator<CreateAccountCommand>
{
    public CreateAccountCommandValidator()
    {
        RuleFor(command => command.ActorId).NotEmpty();
        RuleFor(command => command.Request).NotNull();

        When(command => command.Request is not null, () =>
        {
            RuleFor(command => command.Request.Username)
                .NotEmpty()
                .MaximumLength(100)
                .Must(username => username is null || !username.Any(char.IsWhiteSpace))
                .WithMessage("Username must not contain whitespace.")
                .OverridePropertyName(nameof(CreateAccountRequest.Username));
            RuleFor(command => command.Request.FullName)
                .NotEmpty()
                .MaximumLength(150)
                .OverridePropertyName(nameof(CreateAccountRequest.FullName));
            RuleFor(command => command.Request.Role)
                .Must(AccountRoles.IsCreatable)
                .WithMessage("Role must be Staff or Representative.")
                .OverridePropertyName(nameof(CreateAccountRequest.Role));
            RuleFor(command => command.Request.InitialPassword)
                .NotEmpty()
                .OverridePropertyName(nameof(CreateAccountRequest.InitialPassword));
        });
    }
}
