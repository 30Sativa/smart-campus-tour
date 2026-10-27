using MediatR;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListMapVersionsQuery(string? AreaKey, int Take) : IRequest<IReadOnlyList<MapVersionListItem>>;
public sealed class ListMapVersionsQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<ListMapVersionsQuery, IReadOnlyList<MapVersionListItem>>
{
    public async Task<IReadOnlyList<MapVersionListItem>> Handle(ListMapVersionsQuery query, CancellationToken ct)
    {
        if (query.Take is < 1 or > 100) throw new FluentValidation.ValidationException("Take must be between 1 and 100.");
        var maps = await repository.ListMapVersionsAsync(query.AreaKey, query.Take, ct);
        var result = new List<MapVersionListItem>(maps.Count);
        foreach (var map in maps)
        {
            var latest = await repository.GetLatestDeploymentCheckAsync(map.Id, null, ct);
            result.Add(new(MapPoiAlgorithms.ToMapView(map, map.AreaKeyNavigation.DisplayName),
                latest is null ? null : MapPoiAlgorithms.ToDeploymentView(latest)));
        }
        return result;
    }
}

public sealed record GetMapVersionQuery(Guid Id) : IRequest<MapVersionListItem>;
public sealed class GetMapVersionQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<GetMapVersionQuery, MapVersionListItem>
{
    public async Task<MapVersionListItem> Handle(GetMapVersionQuery query, CancellationToken ct)
    {
        var map = await repository.FindMapVersionAsync(query.Id, false, ct)
            ?? throw new NotFoundException("Map version", query.Id);
        var latest = await repository.GetLatestDeploymentCheckAsync(map.Id, null, ct);
        return new(MapPoiAlgorithms.ToMapView(map, map.AreaKeyNavigation.DisplayName),
            latest is null ? null : MapPoiAlgorithms.ToDeploymentView(latest));
    }
}

public sealed record GetMapPackageQuery(Guid Id) : IRequest<MapPackageDownload>;
public sealed record MapPackageDownload(string FileName, byte[] Bytes, string Sha256);
public sealed class GetMapPackageQueryHandler(IVersionedMapPoiRepository repository)
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

public sealed record ListMapDeploymentChecksQuery(Guid MapVersionId) : IRequest<IReadOnlyList<MapDeploymentCheckView>>;
public sealed class ListMapDeploymentChecksQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<ListMapDeploymentChecksQuery, IReadOnlyList<MapDeploymentCheckView>>
{
    public async Task<IReadOnlyList<MapDeploymentCheckView>> Handle(ListMapDeploymentChecksQuery query, CancellationToken ct)
    {
        if (await repository.FindMapVersionAsync(query.MapVersionId, false, ct) is null)
            throw new NotFoundException("Map version", query.MapVersionId);
        return (await repository.ListDeploymentChecksAsync(query.MapVersionId, ct)).Select(MapPoiAlgorithms.ToDeploymentView).ToArray();
    }
}

public sealed record ListPoiProposalsQuery(Guid? MapVersionId) : IRequest<IReadOnlyList<PoiProposalView>>;
public sealed class ListPoiProposalsQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<ListPoiProposalsQuery, IReadOnlyList<PoiProposalView>>
{
    public async Task<IReadOnlyList<PoiProposalView>> Handle(ListPoiProposalsQuery query, CancellationToken ct)
    {
        var proposals = await repository.ListProposalsAsync(query.MapVersionId, ct);
        var result = new List<PoiProposalView>(proposals.Count);
        foreach (var proposal in proposals)
        {
            var revision = await repository.FindCurrentRevisionAsync(proposal.Id, ct)
                ?? throw new ConflictException("A POI proposal has no current revision.");
            result.Add(await MapPoiViewFactory.CreateProposalViewAsync(repository, proposal, revision, ct));
        }
        return result;
    }
}

public sealed record GetPoiProposalQuery(Guid Id) : IRequest<PoiProposalView>;
public sealed class GetPoiProposalQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<GetPoiProposalQuery, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(GetPoiProposalQuery query, CancellationToken ct)
    {
        var proposal = await repository.FindProposalAsync(query.Id, ct)
            ?? throw new NotFoundException("POI proposal", query.Id);
        var revision = await repository.FindCurrentRevisionAsync(proposal.Id, ct)
            ?? throw new ConflictException("A POI proposal has no current revision.");
        return await MapPoiViewFactory.CreateProposalViewAsync(repository, proposal, revision, ct);
    }
}

public sealed record GetPoiHistoryQuery(Guid Id) : IRequest<PoiHistoryView>;
public sealed class GetPoiHistoryQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<GetPoiHistoryQuery, PoiHistoryView>
{
    public async Task<PoiHistoryView> Handle(GetPoiHistoryQuery query, CancellationToken ct)
    {
        if (await repository.FindProposalAsync(query.Id, ct) is null) throw new NotFoundException("POI proposal", query.Id);
        var revisions = await repository.ListRevisionsAsync(query.Id, ct);
        var revisionViews = new List<PoiRevisionView>(revisions.Count);
        foreach (var revision in revisions)
        {
            var submission = await repository.FindSubmissionAsync(revision.Id, ct);
            var verification = await repository.FindVerificationAsync(revision.Id, ct);
            revisionViews.Add(MapPoiViewFactory.ToRevisionView(revision, submission, verification));
        }
        var checks = (await repository.ListVerificationRecordsAsync(query.Id, ct)).Select(MapPoiAlgorithms.ToVerificationView).ToArray();
        return new(query.Id, revisionViews, checks);
    }
}

public sealed record ListPoiVerificationQueueQuery(Guid? MapVersionId) : IRequest<IReadOnlyList<PoiRevisionView>>;
public sealed class ListPoiVerificationQueueQueryHandler(IVersionedMapPoiRepository repository)
    : IRequestHandler<ListPoiVerificationQueueQuery, IReadOnlyList<PoiRevisionView>>
{
    public async Task<IReadOnlyList<PoiRevisionView>> Handle(ListPoiVerificationQueueQuery query, CancellationToken ct)
    {
        var revisions = await repository.ListSubmittedVerificationQueueAsync(query.MapVersionId, ct);
        var result = new List<PoiRevisionView>(revisions.Count);
        foreach (var revision in revisions)
            result.Add(MapPoiViewFactory.ToRevisionView(revision,
                await repository.FindSubmissionAsync(revision.Id, ct),
                await repository.FindVerificationAsync(revision.Id, ct)));
        return result;
    }
}
