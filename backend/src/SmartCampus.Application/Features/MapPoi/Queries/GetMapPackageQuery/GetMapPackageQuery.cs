using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record GetMapPackageQuery(Guid Id) : IRequest<MapPackageDownload>;
public sealed record MapPackageDownload(string FileName, byte[] Bytes, string Sha256);
public sealed class GetMapPackageQueryHandler(IMapVersionRepository repository)
    : IRequestHandler<GetMapPackageQuery, MapPackageDownload>
{
    public async Task<MapPackageDownload> Handle(GetMapPackageQuery query, CancellationToken ct)
    {
        var map = await repository.FindMapVersionAsync(query.Id, true, ct)
            ?? throw new NotFoundException("Map version", query.Id);
        return new(map.PackageFileName, map.PackageBytes,
            Convert.ToHexString(map.PackageSha256).ToLowerInvariant());
    }
}
