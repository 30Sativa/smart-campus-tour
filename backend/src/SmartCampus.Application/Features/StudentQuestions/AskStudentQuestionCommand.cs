using System.Text;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

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
        RuleForEach(c => c.RecentTurns).ChildRules(turn =>
        {
            turn.RuleFor(t => t.Question).NotEmpty().MaximumLength(StudentQuestionText.MaxQuestionLength);
            turn.RuleFor(t => t.Answer).NotEmpty().MaximumLength(StudentQuestionText.MaxAnswerLength);
        });
    }
}

public sealed class AskStudentQuestionCommandHandler(IStudentAccessRepository repository, IInvitationCodeService codes,
    InvitationSettings settings, IAiAssistantClient assistant, StudentQuestionGate gate, TimeProvider clock,
    IStudentTourViewReader tour)
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
        var earlier = gate.Find(access.SessionId, command.QuestionId, text);
        if (earlier is not null) return earlier;
        if (!gate.TryEnter(access.SessionId))
            throw new TooManyRequestsException("Bạn hỏi hơi nhanh. Đợi một chút rồi hỏi tiếp nhé.");
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
            await CheckAsync(command.TourId, tokenHash, ct);
            var answer = new StudentAnswer(command.QuestionId, result.Answer, result.OutOfScope,
                poi is null ? null : new StudentAnswerPoi(poi.Id, poi.Name), clock.GetUtcNow());
            gate.Remember(access.SessionId, command.QuestionId, text, answer);
            return answer;
        }
        finally
        {
            gate.Exit(access.SessionId);
        }
    }

    private async Task<StudentQuestionAccess> CheckAsync(Guid tourId, byte[] tokenHash, CancellationToken ct)
    {
        var access = await repository.FindQuestionAccessAsync(tourId, tokenHash, clock.GetUtcNow(), ct) ?? throw Invalid();
        if (access.TourState != "RUNNING")
            throw new ConflictException("Trợ lý AI chỉ dùng được khi buổi tham quan đang diễn ra.", "TOUR_NOT_RUNNING");
        return access;
    }
}
