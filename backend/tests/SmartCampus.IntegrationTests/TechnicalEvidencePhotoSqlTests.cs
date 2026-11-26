using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.TechnicalEvidence;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0073: a map deployment check, a manual POI verification and a route test run keep 0-5 evidence photos the checker
/// uploaded to Cloudinary, return them in their views, and treat them as part of the retried request.
/// </summary>
public sealed partial class RobotIntegritySqlTests
{
    private const string EvidenceCloud = "demo-cloud";

    private static string EvidencePhoto(Guid userId) =>
        TechnicalEvidencePhotos.StoredUrl(EvidenceCloud, TechnicalEvidencePhotos.PublicIdFor(userId, Guid.NewGuid()));

    [SchemaV11Fact]
    public async Task EvidencePhotos_ADeploymentCheckKeepsThemAndARetryMustSendTheSame()
    {
        await using var h = await Harness.Create();
        await RobotReadinessTestSupport.AssignAndReportAsync(h.Services, h.Database.ConnectionString, First, h.PilotMap.Id, h.TechnicalId);
        var photos = new[] { EvidencePhoto(h.TechnicalId), EvidencePhoto(h.TechnicalId) };
        RecordMapDeploymentRequest Request(Guid requestId, IReadOnlyList<string>? sent) =>
            new(requestId, First, h.PilotMap.PackageSha256, true, true, "Ảnh màn hình định vị.", sent);

        var requestId = Guid.NewGuid();
        var saved = await h.Send(new RecordMapDeploymentCommand(h.TechnicalId, h.PilotMap.Id, Request(requestId, photos)));
        Assert.Equal(photos, saved.EvidencePhotoUrls);
        Assert.Equal(photos, TechnicalEvidencePhotos.Read((await h.LatestDeployment(First)).EvidencePhotoUrlsJson));

        var replay = await h.Send(new RecordMapDeploymentCommand(h.TechnicalId, h.PilotMap.Id, Request(requestId, photos)));
        Assert.Equal(saved.Id, replay.Id);
        var changed = await Assert.ThrowsAsync<ConflictException>(() =>
            h.Send(new RecordMapDeploymentCommand(h.TechnicalId, h.PilotMap.Id, Request(requestId, photos[..1]))));
        Assert.Equal("IDEMPOTENCY_CONFLICT", changed.Code);

        // A photo from another account's folder is refused before anything is written.
        await Assert.ThrowsAsync<ValidationException>(() => h.Send(new RecordMapDeploymentCommand(h.TechnicalId, h.PilotMap.Id,
            Request(Guid.NewGuid(), [EvidencePhoto(h.StaffId)]))));
        await using (var db = h.Context())
            Assert.Equal(1, await db.MapDeploymentChecks.CountAsync(check => check.EvidencePhotoUrlsJson != null));

        // Without photos the record stays as before ADR-0073.
        var plain = await h.Send(new RecordMapDeploymentCommand(h.TechnicalId, h.PilotMap.Id, Request(Guid.NewGuid(), null)));
        Assert.Empty(plain.EvidencePhotoUrls!);
        Assert.Null((await h.LatestDeployment(First)).EvidencePhotoUrlsJson);
    }

    [SchemaV11Fact]
    public async Task EvidencePhotos_APoiVerificationAndARouteTestRunKeepThem()
    {
        await using var h = await Harness.Create();
        var proposal = await h.Send(new CreatePoiProposalCommand(h.StaffId,
            new(Guid.NewGuid(), new(h.PilotMap.Id, "Sảnh ảnh", "Tham quan", null, 1.5m, 1.5m, 0m, "FRONT"))));
        var submitted = await h.Send(new SubmitPoiProposalCommand(h.StaffId, proposal.Id, new(Guid.NewGuid(), 1, proposal.RowVersion)));
        var poiPhoto = EvidencePhoto(h.TechnicalId);

        var verified = await h.Send(new RecordPoiVerificationCommand(h.TechnicalId, proposal.Id, 1, new(Guid.NewGuid(), 1,
            submitted.RowVersion, First, "PASS", true, true, true, true, null, "Robot dừng đúng vạch.", [poiPhoto])));

        Assert.Equal([poiPhoto], verified.EvidencePhotoUrls);
        await using (var db = h.Context())
            Assert.Equal([poiPhoto], TechnicalEvidencePhotos.Read(
                (await db.PoiVerificationRecords.AsNoTracking().SingleAsync(record => record.Id == verified.Id)).EvidencePhotoUrlsJson));

        var route = await h.TestedRoute();
        var runPhotos = new[] { EvidencePhoto(h.TechnicalId), EvidencePhoto(h.TechnicalId), EvidencePhoto(h.TechnicalId) };
        var tested = await h.Send(new RecordRouteTestRunCommand(h.TechnicalId, route.RouteId, route.RevisionId,
            new(Guid.NewGuid(), First, h.StaffId, "PASS", true, true, true, null, "Chạy thử có ảnh.", EvidencePhotoUrls: runPhotos)));

        var latest = tested.TestRuns.OrderByDescending(run => run.CheckedAt).First();
        Assert.Equal(runPhotos, latest.EvidencePhotoUrls);
        Assert.Contains(tested.TestRuns, run => run.EvidencePhotoUrls is { Count: 0 });
        var read = await h.Send(new GetRouteRevisionQuery(route.RouteId, route.RevisionId, false));
        Assert.Equal(runPhotos, read.TestRuns.Single(run => run.Id == latest.Id).EvidencePhotoUrls);
    }
}
