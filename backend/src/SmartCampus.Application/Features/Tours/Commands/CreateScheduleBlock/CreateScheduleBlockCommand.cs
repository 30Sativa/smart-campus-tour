using System.Globalization;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CreateScheduleBlock;

/// <summary><paramref name="ShiftCode"/> null closes the whole day.</summary>
public sealed record CreateScheduleBlockRequest(Guid RequestId, DateOnly Date, string? ShiftCode, string Reason);
public sealed record CreateScheduleBlockCommand(Guid Actor, CreateScheduleBlockRequest Request) : ITourMutationCommand<TourShiftBlockView>;

public sealed class CreateScheduleBlockCommandValidator : AbstractValidator<CreateScheduleBlockCommand>
{
    public CreateScheduleBlockCommandValidator(TourScheduleSettings settings)
    {
        RuleFor(c => c.Request.RequestId).NotEmpty();
        RuleFor(c => c.Request.Date).NotEmpty();
        RuleFor(c => c.Request.Reason).Must(reason => !string.IsNullOrWhiteSpace(reason)).WithMessage("Nhập lý do khoá.").MaximumLength(500);
        RuleFor(c => c.Request.ShiftCode).Must(code => code is null || settings.Shifts.Any(shift => shift.Code == code))
            .WithMessage("Ca này không có trong cấu hình.");
    }
}

/// <summary>Admin closes a campus day or one shift of it (docs/lich-tour-theo-ca.md §5), under the same date lock Tour create takes.</summary>
public sealed class CreateScheduleBlockCommandHandler(IScheduleBlockRepository blocks, TourScheduleSettings settings, TimeProvider clock)
    : IRequestHandler<CreateScheduleBlockCommand, TourShiftBlockView>
{
    public async Task<TourShiftBlockView> Handle(CreateScheduleBlockCommand command, CancellationToken ct)
    {
        var input = command.Request;
        var reason = input.Reason.Trim();
        var fingerprint = ScheduleBlockAudit.Fingerprint(ScheduleBlockAudit.Created, new { input.Date, input.ShiftCode, reason });
        if (await ScheduleBlockAudit.ReplayAsync(blocks, command.Actor, input.RequestId, ScheduleBlockAudit.Created, fingerprint, ct) is { } replayed)
            return new(replayed, Scope(input.ShiftCode), reason);

        await blocks.LockDateAsync(input.Date, ct);
        var active = await blocks.ListActiveAsync(input.Date, input.Date, ct);
        var clash = active.FirstOrDefault(block => input.ShiftCode is null || block.ShiftCode is null || block.ShiftCode == input.ShiftCode);
        if (clash is not null)
            throw new ConflictException(clash.ShiftCode is null
                ? "Cả ngày này đã bị khoá. Gỡ khoá ngày trước nếu muốn đổi."
                : input.ShiftCode is null
                    ? "Ngày này đang có ca bị khoá riêng. Gỡ khoá các ca đó trước rồi khoá cả ngày."
                    : "Ca này đã bị khoá.", "SCHEDULE_BLOCK_EXISTS");

        var (startsAt, endsAt) = input.ShiftCode is null
            ? TourSchedule.DayWindow(input.Date)
            : TourSchedule.ShiftWindow(input.Date, settings.Shifts.Single(shift => shift.Code == input.ShiftCode));
        var tours = await blocks.ListToursInWindowAsync(startsAt, endsAt, ct);
        if (tours.Count > 0)
            throw new ConflictException($"Còn {tours.Count} Tour chưa huỷ trong {(input.ShiftCode is null ? "ngày" : "ca")} này. Staff cần huỷ Tour trước rồi mới khoá được.",
                "SHIFT_HAS_TOURS", blockers: tours.Select(tour => new ConflictBlocker(tour.Id.ToString("D"),
                    $"{tour.Name} ({tour.ScheduledStartAt.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm dd/MM/yyyy", CultureInfo.InvariantCulture)})")).ToArray());

        var now = clock.GetUtcNow();
        var created = new TourScheduleBlock
        {
            Id = Guid.NewGuid(), BlockDate = input.Date, ShiftCode = input.ShiftCode, Reason = reason, CreatedByUserId = command.Actor, CreatedAt = now
        };
        blocks.Add(created);
        ScheduleBlockAudit.Append(blocks, created, command.Actor, input.RequestId, ScheduleBlockAudit.Created, fingerprint, now);
        return new(created.Id, Scope(input.ShiftCode), reason);
    }

    private static string Scope(string? shiftCode) => shiftCode is null ? ScheduleBlockScope.Day : ScheduleBlockScope.Shift;
}
