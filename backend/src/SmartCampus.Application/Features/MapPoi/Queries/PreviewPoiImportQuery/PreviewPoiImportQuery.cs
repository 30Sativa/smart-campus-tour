using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record PreviewPoiImportQuery(PreviewPoiImportRequest Request) : IRequest<PoiImportPreview>;

public sealed class PreviewPoiImportQueryValidator : AbstractValidator<PreviewPoiImportQuery>
{
    public PreviewPoiImportQueryValidator()
    {
        RuleFor(query => query.Request.MapVersionId).NotEmpty();
        RuleFor(query => query.Request.RobotCode).NotEmpty().MaximumLength(100);
    }
}

public sealed class PreviewPoiImportQueryHandler(IMapVersionRepository mapRepository, IPoiImportRepository importRepository, MapPoiSettings settings)
    : IRequestHandler<PreviewPoiImportQuery, PoiImportPreview>
{
    public async Task<PoiImportPreview> Handle(PreviewPoiImportQuery query, CancellationToken cancellationToken)
    {
        var request = query.Request;
        var sources = PoiImportFileSet.Expand(request.Files);
        var map = await mapRepository.FindMapVersionAsync(request.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", request.MapVersionId);
        var robotCode = request.RobotCode.Trim();
        var robot = await mapRepository.FindPhysicalRobotAsync(robotCode, cancellationToken)
            ?? throw new NotFoundException("Physical robot", robotCode);
        RobotLifecycleRules.EnsureActive(robot);

        var planned = await PoiImportPlanner.PlanAsync(importRepository, mapRepository, map, robot,
            PoiImportPlanner.Parse(sources), settings, cancellationToken);
        return new PoiImportPreview(map.Id, robot.RobotCode, planned.All(file => file.ErrorCode is null),
            planned.Select(file => file.ToPreview()).ToArray());
    }
}
