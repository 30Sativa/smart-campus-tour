using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Tours.Commands.RemoveScheduleBlock;

public sealed record RemoveScheduleBlockRequest(Guid RequestId);
public sealed record RemoveScheduleBlockCommand(Guid Id, Guid Actor, RemoveScheduleBlockRequest Request) : ITourMutationCommand<Unit>;

public sealed class RemoveScheduleBlockCommandValidator : AbstractValidator<RemoveScheduleBlockCommand>
{
    public RemoveScheduleBlockCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Request.RequestId).NotEmpty();
    }
}

/// <summary>Reopens a day or shift; the row stays with who removed it (docs/lich-tour-theo-ca.md §5).</summary>
public sealed class RemoveScheduleBlockCommandHandler(IScheduleBlockRepository blocks, TimeProvider clock)
    : IRequestHandler<RemoveScheduleBlockCommand, Unit>
{
    public async Task<Unit> Handle(RemoveScheduleBlockCommand command, CancellationToken ct)
    {
        var fingerprint = ScheduleBlockAudit.Fingerprint(ScheduleBlockAudit.Removed, new { command.Id });
        if (await ScheduleBlockAudit.ReplayAsync(blocks, command.Actor, command.Request.RequestId, ScheduleBlockAudit.Removed, fingerprint, ct) is not null)
            return Unit.Value;

        var date = await blocks.FindDateAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy khoá lịch.");
        await blocks.LockDateAsync(date, ct);
        var block = await blocks.FindAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy khoá lịch.");
        if (block.RemovedAt is not null)
            throw new ConflictException("Khoá này đã được gỡ trước đó. Tải lại trang.", "SCHEDULE_BLOCK_ALREADY_REMOVED");

        var now = clock.GetUtcNow();
        block.RemovedAt = now;
        block.RemovedByUserId = command.Actor;
        ScheduleBlockAudit.Append(blocks, block, command.Actor, command.Request.RequestId, ScheduleBlockAudit.Removed, fingerprint, now);
        return Unit.Value;
    }
}
