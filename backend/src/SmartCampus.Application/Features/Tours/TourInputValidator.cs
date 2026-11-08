using FluentValidation;

namespace SmartCampus.Application.Features.Tours;

public sealed class CreateTourInputValidator : AbstractValidator<CreateTourInput>
{
    public CreateTourInputValidator(TourScheduleSettings settings)
    {
        RuleFor(t => t.Capacity).InclusiveBetween(1, settings.MaxCapacity).WithMessage($"Sức chứa phải từ 1 đến {settings.MaxCapacity} chỗ.");
        RuleFor(t => t.Name).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(150);
        RuleFor(t => t.Description).MaximumLength(1000);
        RuleFor(t => t.RouteRevisionId).NotEmpty();
        RuleFor(t => t.RobotCode).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(100);
        RuleFor(t => t.OperatorUserId).NotEmpty();
        RuleFor(t => t.ScheduledStartAt).NotEmpty()
            .Must(t => t.UtcTicks % TimeSpan.TicksPerMillisecond == 0).WithMessage("Lịch Tour hỗ trợ độ chính xác tới millisecond.");
        RuleFor(t => t.FallbackVideoUrl).MaximumLength(1000).Must(url => string.IsNullOrWhiteSpace(url) ||
            Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo));
    }
}

public sealed class TourInputValidator : AbstractValidator<TourInput>
{
    public TourInputValidator()
    {
        RuleFor(t => t.Name).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(150);
        RuleFor(t => t.Description).MaximumLength(1000);
        RuleFor(t => t.RouteId).NotEmpty();
        RuleFor(t => t.ScheduledStartAt).NotEmpty()
            .Must(t => t.UtcTicks % TimeSpan.TicksPerMillisecond == 0).WithMessage("Lịch Tour hỗ trợ độ chính xác tới millisecond.");
        RuleFor(t => t.FallbackVideoUrl).MaximumLength(1000).Must(url => string.IsNullOrWhiteSpace(url) ||
            Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo));
    }
}
