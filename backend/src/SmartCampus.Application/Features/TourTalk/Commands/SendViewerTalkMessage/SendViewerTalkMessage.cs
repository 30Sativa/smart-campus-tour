using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.TourTalk.Commands.SendViewerTalkMessage;

/// <summary>
/// ADR-0070: a Viewer answers the Operator in text. Only the Tour's Staff read it; other Viewers never do.
/// In-memory only, like the Staff side.
/// </summary>
public sealed record SendViewerTalkMessageCommand(Guid TourId, string? SessionToken, string Text) : IRequest<TourTalkMessageView>;

public sealed class SendViewerTalkMessageCommandValidator : AbstractValidator<SendViewerTalkMessageCommand>
{
    public SendViewerTalkMessageCommandValidator()
    {
        RuleFor(c => c.TourId).NotEmpty();
        RuleFor(c => c.Text).Must(text => TourTalkLimits.NormalizeText(text).Length is >= 1 and <= TourTalkLimits.MaxTextLength)
            .WithMessage($"Tin nhắn phải có từ 1 đến {TourTalkLimits.MaxTextLength} ký tự.");
    }
}

public sealed class SendViewerTalkMessageCommandHandler(ITourTalkReader reader, IInvitationCodeService codes,
    InvitationSettings settings, TourTalkStore store, TimeProvider clock)
    : IRequestHandler<SendViewerTalkMessageCommand, TourTalkMessageView>
{
    public async Task<TourTalkMessageView> Handle(SendViewerTalkMessageCommand command, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var viewer = await TourTalkViewerAccess.ResolveAsync(reader, codes, settings, command.TourId, command.SessionToken, now, ct);
        TourTalkWindow.EnsureOpen(viewer.TourState, viewer.ScheduledStartAt, now);
        var entry = store.AddViewer(command.TourId, viewer.RosterRowId, viewer.DisplayName, viewer.ClassName, viewer.RowType,
            TourTalkLimits.NormalizeText(command.Text));
        return entry.ForViewer(viewer.RosterRowId);
    }
}
