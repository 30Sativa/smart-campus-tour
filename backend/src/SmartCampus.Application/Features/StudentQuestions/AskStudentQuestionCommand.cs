using System.Text;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.TourEngagement;

namespace SmartCampus.Application.Features.StudentQuestions;

public sealed record StudentQuestionTurn(string Question, string Answer);
public sealed record StudentAnswerPoi(Guid Id, string Name);
public sealed record StudentAnswer(Guid QuestionId, string Answer, bool OutOfScope, StudentAnswerPoi? Poi,
    DateTimeOffset AnsweredAt);

/// <summary>
/// Private Student question (docs/architecture.md §7.1). Read-only: no transaction or Tour lock is held
/// while the assistant works, and access is checked again before the answer is returned.
/// </summary>
public sealed record AskStudentQuestionCommand(Guid TourId, string? SessionToken, Guid QuestionId, string Text,
    IReadOnlyList<StudentQuestionTurn> RecentTurns) : IRequest<StudentAnswer>;

public static class StudentQuestionText
{
    public const int MaxQuestionLength = 500;
    public const int MaxAnswerLength = 1200;
    public const int MaxRecentTurns = 3;

    public static string Normalize(string? text) => (text ?? "").Normalize(NormalizationForm.FormC).Trim();
}

/// <summary>
/// When a Viewer may ask (docs/architecture.md §7.1): while the Tour is RUNNING, and in the waiting room from
/// <see cref="WaitingRoomLead"/> before the scheduled start of a SCHEDULED or READY Tour, so the group can ask about the
/// school while it waits. Earlier the waiting room only counts down; an ended or cancelled Tour never answers.
/// </summary>
public static class StudentQuestionWindow
{
    public static readonly TimeSpan WaitingRoomLead = TimeSpan.FromMinutes(15);
    public const string OpensLaterCode = "AI_OPENS_LATER";
    public const string NotRunningCode = "TOUR_NOT_RUNNING";

    public static bool InWaitingRoom(string tourState) => tourState is "SCHEDULED" or "READY";

    public static bool IsOpen(StudentQuestionAccess access, DateTimeOffset now) =>
        access.TourState == "RUNNING" ||
        InWaitingRoom(access.TourState) && access.ScheduledStartAt is { } start && now >= start - WaitingRoomLead;
}

public sealed class AskStudentQuestionCommandValidator : AbstractValidator<AskStudentQuestionCommand>
{
    public AskStudentQuestionCommandValidator()
    {
        RuleFor(c => c.QuestionId).NotEmpty();
        RuleFor(c => c.Text).Must(text => StudentQuestionText.Normalize(text).Length is >= 1 and <= StudentQuestionText.MaxQuestionLength)
            .WithMessage($"Câu hỏi phải có từ 1 đến {StudentQuestionText.MaxQuestionLength} ký tự.");
        RuleFor(c => c.RecentTurns).NotNull()
            .Must(turns => turns is null || turns.Count <= StudentQuestionText.MaxRecentTurns)
            .WithMessage($"Chỉ gửi tối đa {StudentQuestionText.MaxRecentTurns} lượt hỏi đáp gần nhất.");
        RuleForEach(c => c.RecentTurns).NotNull().ChildRules(turn =>
        {
            turn.RuleFor(t => t.Question).NotEmpty().MaximumLength(StudentQuestionText.MaxQuestionLength);
            turn.RuleFor(t => t.Answer).NotEmpty().MaximumLength(StudentQuestionText.MaxAnswerLength);
        });
    }
}

public sealed class AskStudentQuestionCommandHandler(IStudentAccessRepository repository, IInvitationCodeService codes,
    InvitationSettings settings, IAiAssistantClient assistant, StudentQuestionGate gate, TimeProvider clock,
    IStudentTourViewReader tour, IStudentQuestionEventRecorder questions, ILogger<AskStudentQuestionCommandHandler> logger)
    : IRequestHandler<AskStudentQuestionCommand, StudentAnswer>
{
    private static UnauthorizedException Invalid() =>
        new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");

    public async Task<StudentAnswer> Handle(AskStudentQuestionCommand command, CancellationToken ct)
    {
        if (!settings.Enabled || string.IsNullOrEmpty(command.SessionToken)) throw Invalid();
        var tokenHash = codes.Hash("browser-session:" + command.SessionToken);
        var access = await CheckAsync(command.TourId, tokenHash, ct);
        var text = StudentQuestionText.Normalize(command.Text);
        var earlier = gate.Enter(access.SessionId, command.QuestionId, text);
        if (earlier is not null) return earlier;
        try
        {
            // POI snapshot from the Tour's progress columns: the current stop while the robot is at it, otherwise
            // null and the assistant answers from general campus content (§7.1).
            var poi = await tour.FindCurrentPoiAsync(command.TourId, ct);
            var turns = command.RecentTurns
                .Select(t => new AssistantTurn(StudentQuestionText.Normalize(t.Question), StudentQuestionText.Normalize(t.Answer)))
                .ToList();
            var result = await assistant.AnswerAsync(new AssistantQuestion(Guid.NewGuid(), text, turns, poi), ct);
            // Access may have been revoked or the Tour ended while the assistant worked: never return a late answer.
            var current = await CheckAsync(command.TourId, tokenHash, ct);
            var answer = new StudentAnswer(command.QuestionId, result.Answer, result.OutOfScope,
                poi is null ? null : new StudentAnswerPoi(poi.Id, poi.Name), clock.GetUtcNow());
            gate.Remember(access.SessionId, command.QuestionId, text, answer);
            await CountAsync(command.TourId, current, result.OutOfScope, ct);
            return answer;
        }
        finally
        {
            gate.Exit(access.SessionId);
        }
    }

    /// <summary>
    /// ADR-0071: one counted question for the engagement report, never its text. A repeat of a question id is not counted
    /// again (it returns above), and a failure to count never costs the Student the answer.
    /// </summary>
    private async Task CountAsync(Guid tourId, StudentQuestionAccess access, bool outOfScope, CancellationToken ct)
    {
        var phase = StudentQuestionWindow.InWaitingRoom(access.TourState) ? TourEngagementEvents.PhaseWaitingRoom : TourEngagementEvents.PhaseTour;
        try
        {
            await questions.RecordAsync(tourId, phase, access.RowType, outOfScope, ct);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogWarning(error, "Could not count a Student question for Tour {TourId}.", tourId);
        }
    }

    private async Task<StudentQuestionAccess> CheckAsync(Guid tourId, byte[] tokenHash, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var access = await repository.FindQuestionAccessAsync(tourId, tokenHash, now, ct) ?? throw Invalid();
        if (StudentQuestionWindow.IsOpen(access, now)) return access;
        if (StudentQuestionWindow.InWaitingRoom(access.TourState))
            throw new ConflictException(
                $"Trợ lý AI mở từ {StudentQuestionWindow.WaitingRoomLead.TotalMinutes:0} phút trước giờ bắt đầu buổi tham quan.",
                StudentQuestionWindow.OpensLaterCode);
        throw new ConflictException("Trợ lý AI chỉ dùng được khi buổi tham quan đang diễn ra.", StudentQuestionWindow.NotRunningCode);
    }
}
