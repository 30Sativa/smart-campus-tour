using FluentValidation;

namespace SmartCampus.Application.Features.Auth.Login;

public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(command => command.Username)
            .NotEmpty()
            .MaximumLength(100)
            .Must(username => username is null || !username.Any(char.IsWhiteSpace))
            .WithMessage("Username must not contain whitespace.");
        RuleFor(command => command.Password)
            .NotEmpty();
    }
}
