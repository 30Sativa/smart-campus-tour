using FluentValidation;

namespace SmartCampus.Application.Features.Tours;

public sealed class CreateTourInputValidator : AbstractValidator<CreateTourInput>
{
    public CreateTourInputValidator(TourScheduleSettings settings)
    {
        RuleFor(t => t.Capacity).InclusiveBetween(1, settings.MaxCapacity).WithMessage($"Sức chứa phải từ 1 đến {settings.MaxCapacity} chỗ.");
        // ADR-0053: a reason makes the Tour quick, and a quick Tour has no start of its own.
        RuleFor(t => t.ShortNoticeReason).MaximumLength(500).Must(reason => reason is null || !string.IsNullOrWhiteSpace(reason))
            .WithMessage("Tour nhanh cần có lý do.");
        RuleFor(t => t.ScheduledStartAt).NotNull().When(t => t.ShortNoticeReason is null).WithMessage("Chọn ca cho Tour.");
        RuleFor(t => t.ScheduledStartAt).Null().When(t => t.ShortNoticeReason is not null).WithMessage("Tour nhanh không chọn giờ bắt đầu.");
        RuleFor(t => t.Name).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(150);
        RuleFor(t => t.Description).MaximumLength(1000);
        RuleFor(t => t.RouteRevisionId).NotEmpty();
        RuleFor(t => t.RobotCode).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(100);
        RuleFor(t => t.OperatorUserId).NotEmpty();
        RuleFor(t => t.ScheduledStartAt)
            .Must(t => t is null || t.Value.UtcTicks % TimeSpan.TicksPerMillisecond == 0).WithMessage("Lịch Tour hỗ trợ độ chính xác tới millisecond.");
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
