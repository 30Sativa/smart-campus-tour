using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.CreateQuickTour;

public sealed record CreateQuickTourRequest(Guid RequestId, QuickTourInput Configuration);
public sealed record CreateQuickTourCommand(Guid Actor, CreateQuickTourRequest Request) : ITourMutationCommand<TourMutationResult>;

public sealed class CreateQuickTourCommandValidator : AbstractValidator<CreateQuickTourCommand>
{
    public CreateQuickTourCommandValidator(TourScheduleSettings settings)
    {
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.Configuration).NotNull().SetValidator(new QuickTourInputValidator(settings));
        });
    }
}

public sealed class QuickTourInputValidator : AbstractValidator<QuickTourInput>
{
    public QuickTourInputValidator(TourScheduleSettings settings)
    {
        RuleFor(t => t.Capacity).InclusiveBetween(1, settings.MaxCapacity).WithMessage($"Sức chứa phải từ 1 đến {settings.MaxCapacity} chỗ.");
        RuleFor(t => t.Reason).NotEmpty().Must(reason => !string.IsNullOrWhiteSpace(reason)).WithMessage("Tour nhanh cần có lý do.")
            .MaximumLength(500);
        RuleFor(t => t.Name).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(150);
        RuleFor(t => t.Description).MaximumLength(1000);
        RuleFor(t => t.RouteRevisionId).NotEmpty();
        RuleFor(t => t.RobotCode).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(100);
        RuleFor(t => t.OperatorUserId).NotEmpty();
        RuleFor(t => t.FallbackVideoUrl).MaximumLength(1000).Must(url => string.IsNullOrWhiteSpace(url) ||
            Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo));
    }
}
