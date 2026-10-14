using MediatR;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Features.StudentQuestions;

namespace SmartCampus.Api.Controllers;

/// <summary>Private Student Q&amp;A (docs/architecture.md §7.1). Authenticated by the per-Tour Student session cookie.</summary>
[ApiController]
[Route("api/student/tours/{tourId:guid}")]
public sealed class StudentQuestionsController(ISender sender, IConfiguration configuration) : ControllerBase
{
    public sealed record TurnRequest(string Question, string Answer);
    public sealed record AskRequest(Guid QuestionId, string Text, IReadOnlyList<TurnRequest>? RecentTurns);

    [HttpPost("questions")]
    public async Task<ActionResult<BaseResponse<StudentAnswer>>> Ask(Guid tourId, AskRequest request, CancellationToken ct)
    {
        StudentSessionCookie.EnsureAllowedOrigin(Request, configuration);
        var turns = (request.RecentTurns ?? []).Select(t => new StudentQuestionTurn(t.Question, t.Answer)).ToList();
        var answer = await sender.Send(new AskStudentQuestionCommand(tourId, Request.Cookies[StudentSessionCookie.Name(tourId)],
            request.QuestionId, request.Text, turns), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<StudentAnswer> { Success = true, Message = "OK", Data = answer });
    }
}
