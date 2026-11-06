using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetHead;

namespace SmartCampus.Application.Features.FleetHead.Commands.PollHeadCommands;

/// <summary>ADR-0045 robot long poll: records the head state and hands out new head commands, waiting for one if needed.</summary>
public sealed class PollHeadCommandsHandler(IHeadCommandChannel channel) : IRequestHandler<PollHeadCommands, HeadPollBatch>
{
    public Task<HeadPollBatch> Handle(PollHeadCommands request, CancellationToken ct) =>
        channel.PollAsync(request.RobotCode, request.Epoch, request.AfterSeq, TimeSpan.FromMilliseconds(request.WaitMs),
            request.Head, ct);
}
