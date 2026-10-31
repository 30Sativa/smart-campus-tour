using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.RobotCredentials;

public sealed record GetRobotCredentialQuery(string RobotCode) : IRequest<RobotCredentialView>;

public sealed class GetRobotCredentialQueryHandler(IPhysicalRobotCredentialManager manager)
    : IRequestHandler<GetRobotCredentialQuery, RobotCredentialView>
{
    public async Task<RobotCredentialView> Handle(GetRobotCredentialQuery query, CancellationToken ct) =>
        await manager.GetAsync(query.RobotCode.Trim(), ct)
        ?? throw new NotFoundException("Physical robot", query.RobotCode);
}
