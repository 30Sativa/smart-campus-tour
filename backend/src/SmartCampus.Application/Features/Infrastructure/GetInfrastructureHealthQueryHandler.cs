using MediatR;

namespace SmartCampus.Application.Features.Infrastructure;

public sealed class GetInfrastructureHealthQueryHandler(
    IInfrastructureMetricsCollector collector)
    : IRequestHandler<GetInfrastructureHealthQuery, InfrastructureHealthDto>
{
    public Task<InfrastructureHealthDto> Handle(
        GetInfrastructureHealthQuery request,
        CancellationToken cancellationToken) =>
        collector.CollectAsync(cancellationToken);
}
