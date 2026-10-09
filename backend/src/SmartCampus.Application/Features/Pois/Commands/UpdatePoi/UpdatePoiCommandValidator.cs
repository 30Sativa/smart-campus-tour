using FluentValidation;
using SmartCampus.Application.Features.Pois.Commands.CreatePoi;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Commands.UpdatePoi;

public sealed class UpdatePoiCommandValidator : AbstractValidator<UpdatePoiCommand>
{
    public UpdatePoiCommandValidator()
    {
        RuleFor(command => command.Id).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
        RuleFor(command => command.Request).NotNull();
        When(command => command.Request is not null, () =>
        {
            RuleFor(command => command.Request.ExpectedRowVersion)
                .Must(PoiRowVersion.IsValid)
                .WithMessage("ExpectedRowVersion must be a base64-encoded SQL Server row version.");
            RuleFor(command => command.Request.Name).NotEmpty()
                .Must(value => !string.IsNullOrWhiteSpace(value)).WithMessage("Name is required.")
                .MaximumLength(150);
            RuleFor(command => command.Request.Description).MaximumLength(2000);
            RuleFor(command => command.Request.MapKey).NotEmpty()
                .Must(value => !string.IsNullOrWhiteSpace(value)).WithMessage("MapKey is required.")
                .MaximumLength(100);
            RuleFor(command => command.Request.MapFrame).NotEmpty()
                .Must(value => !string.IsNullOrWhiteSpace(value)).WithMessage("MapFrame is required.")
                .MaximumLength(100);
            RuleFor(command => command.Request.X).InclusiveBetween(-999999.9999m, 999999.9999m)
                .Must(value => decimal.Round(value, 4) == value).WithMessage("X supports at most 4 decimal places.");
            RuleFor(command => command.Request.Y).InclusiveBetween(-999999.9999m, 999999.9999m)
                .Must(value => decimal.Round(value, 4) == value).WithMessage("Y supports at most 4 decimal places.");
            RuleFor(command => command.Request.Yaw).InclusiveBetween(-3.141593m, 3.141593m)
                .Must(value => decimal.Round(value, 6) == value).WithMessage("Yaw supports at most 6 decimal places.");
            RuleFor(command => command.Request.NarrationSeconds).GreaterThan(0).When(command => command.Request.NarrationSeconds.HasValue);
            RuleFor(command => command.Request.AudioUrl).MaximumLength(1000);
            RuleFor(command => command.Request.FallbackVideoUrl).MaximumLength(1000);
        });
    }
}
