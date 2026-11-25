using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.TourTalk.Commands.SendStaffTalkMessage;

/// <summary>
/// ADR-0070: the Operator of the Tour says something to every Viewer, as text, a recorded voice clip, or both.
/// In-memory only: deliberately not ICommand, so no SQL transaction is opened for a message.
/// </summary>
public sealed record SendStaffTalkMessageCommand(Guid TourId, Guid Actor, string? Text, byte[]? Audio, string? AudioContentType,
    int? AudioDurationMs) : IRequest<TourTalkMessageView>;

public sealed class SendStaffTalkMessageCommandValidator : AbstractValidator<SendStaffTalkMessageCommand>
{
    public SendStaffTalkMessageCommandValidator()
    {
        RuleFor(c => c.TourId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c).Must(c => TourTalkLimits.NormalizeText(c.Text).Length > 0 || c.Audio is { Length: > 0 })
            .WithName("text").WithMessage("Tin nhắn cần có nội dung chữ hoặc đoạn ghi âm.");
        RuleFor(c => c.Text).Must(text => TourTalkLimits.NormalizeText(text).Length <= TourTalkLimits.MaxTextLength)
            .WithMessage($"Tin nhắn tối đa {TourTalkLimits.MaxTextLength} ký tự.");
        When(c => c.Audio is { Length: > 0 }, () =>
        {
            RuleFor(c => c.Audio!.Length).LessThanOrEqualTo(TourTalkLimits.MaxAudioBytes).WithName("audio")
                .WithMessage("Đoạn ghi âm quá lớn.");
            RuleFor(c => c.AudioContentType).Must(type => TourTalkLimits.NormalizeAudioType(type) is not null).WithName("audio")
                .WithMessage("Định dạng ghi âm không được hỗ trợ.");
            RuleFor(c => c.AudioDurationMs).NotNull().InclusiveBetween(1, TourTalkLimits.MaxAudioMilliseconds).WithName("durationMs")
                .WithMessage($"Đoạn ghi âm dài tối đa {TourTalkLimits.MaxAudioMilliseconds / 1000} giây.");
        });
    }
}

public sealed class SendStaffTalkMessageCommandHandler(ITourTalkReader reader, TourTalkStore store, TimeProvider clock)
    : IRequestHandler<SendStaffTalkMessageCommand, TourTalkMessageView>
{
    public async Task<TourTalkMessageView> Handle(SendStaffTalkMessageCommand command, CancellationToken ct)
    {
        var tour = await reader.GetTourAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới nói chuyện với người xem được.");
        TourTalkWindow.EnsureOpen(tour.State, tour.ScheduledStartAt, clock.GetUtcNow());

        var text = TourTalkLimits.NormalizeText(command.Text);
        var audio = command.Audio is { Length: > 0 } ? command.Audio : null;
        var entry = store.AddStaff(tour.TourId, command.Actor, tour.OperatorName, text.Length > 0 ? text : null, audio,
            audio is null ? null : TourTalkLimits.NormalizeAudioType(command.AudioContentType),
            audio is null ? null : command.AudioDurationMs);
        return entry.ForStaff();
    }
}
