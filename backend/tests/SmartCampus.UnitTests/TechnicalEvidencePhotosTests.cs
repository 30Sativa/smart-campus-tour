using FluentValidation;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;
using SmartCampus.Application.Features.TechnicalEvidence;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0073: evidence photos are public Cloudinary images the checker uploaded under their own folder.</summary>
public sealed class TechnicalEvidencePhotosTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(1_794_900_000);
    private static readonly Guid Checker = Guid.Parse("0b4f1c6e-9a37-4d1e-8f52-3c7a9e2d1b40");
    private static readonly Guid Other = Guid.Parse("5d2e8a91-7c43-4b6f-a1d0-9e8f7c6b5a43");
    private static CloudinarySettings Settings() => new("demo-cloud", "123456789012345", "test-secret");

    private static string Photo(Guid user) =>
        TechnicalEvidencePhotos.StoredUrl("demo-cloud", TechnicalEvidencePhotos.PublicIdFor(user, Guid.NewGuid()));

    [Fact]
    public void UploadFields_SignANewPublicIdUnderTheCheckersFolder()
    {
        var publicId = TechnicalEvidencePhotos.PublicIdFor(Checker, Guid.Parse("11111111-2222-3333-4444-555555555555"));
        var fields = TechnicalEvidencePhotos.UploadFields(Settings(), publicId, Now);

        Assert.Equal("smartcampus/technical-evidence/0b4f1c6e9a374d1e8f523c7a9e2d1b40/11111111222233334444555555555555",
            fields["public_id"]);
        Assert.Equal(TechnicalEvidencePhotos.AllowedFormats, fields["allowed_formats"]);
        Assert.Equal(TechnicalEvidencePhotos.Incoming, fields["transformation"]);
        Assert.Equal("1794900000", fields["timestamp"]);
        Assert.Equal("123456789012345", fields["api_key"]);
        // A new public ID each time, so an upload never replaces stored evidence.
        Assert.False(fields.ContainsKey("overwrite"));
        Assert.False(fields.ContainsKey("type"));
        Assert.DoesNotContain(fields.Values, value => value.Contains("test-secret", StringComparison.Ordinal));

        var signed = fields.Where(pair => pair.Key is not ("api_key" or "signature")).ToDictionary(pair => pair.Key, pair => pair.Value);
        Assert.Equal(FallbackVideoAssets.UploadSignature(signed, "test-secret"), fields["signature"]);
    }

    [Fact]
    public async Task Ticket_GivesAFreshStoredUrlEachCall()
    {
        var handler = new GetEvidencePhotoUploadQueryHandler(Settings(), new FixedClock(Now));
        var first = await handler.Handle(new GetEvidencePhotoUploadQuery(Checker), default);
        var second = await handler.Handle(new GetEvidencePhotoUploadQuery(Checker), default);

        Assert.Equal("https://api.cloudinary.com/v1_1/demo-cloud/image/upload", first.UploadUrl);
        Assert.NotEqual(first.StoredUrl, second.StoredUrl);
        Assert.True(TechnicalEvidencePhotos.IsOwnUpload("demo-cloud", Checker, first.StoredUrl));
        Assert.Equal(TechnicalEvidencePhotos.MaxPhotos, first.MaxPhotos);
        Assert.Equal(TechnicalEvidencePhotos.MaxBytes, first.MaxBytes);
    }

    [Fact]
    public async Task Ticket_IsUnavailableWithoutCloudinary()
    {
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            new GetEvidencePhotoUploadQueryHandler(new CloudinarySettings(), new FixedClock(Now))
                .Handle(new GetEvidencePhotoUploadQuery(Checker), default));
        Assert.Equal(GetEvidencePhotoUploadQueryHandler.Unavailable, error.Code);
    }

    [Fact]
    public void Normalize_KeepsNoPhotosForAMissingOrEmptyList()
    {
        Assert.Empty(TechnicalEvidencePhotos.Normalize(null, Settings(), Checker));
        Assert.Empty(TechnicalEvidencePhotos.Normalize([], new CloudinarySettings(), Checker));
        Assert.Null(TechnicalEvidencePhotos.Write([]));
    }

    [Fact]
    public void Normalize_KeepsTheCheckersOwnPhotosInOrder()
    {
        var photos = Enumerable.Range(0, TechnicalEvidencePhotos.MaxPhotos).Select(_ => Photo(Checker)).ToArray();
        var kept = TechnicalEvidencePhotos.Normalize(photos.Select(p => $" {p} ").ToArray(), Settings(), Checker);

        Assert.Equal(photos, kept);
        Assert.Equal(photos, TechnicalEvidencePhotos.Read(TechnicalEvidencePhotos.Write(kept)));
    }

    [Fact]
    public void Normalize_RefusesMoreThanFivePhotos() =>
        Assert.Throws<ValidationException>(() => TechnicalEvidencePhotos.Normalize(
            Enumerable.Range(0, TechnicalEvidencePhotos.MaxPhotos + 1).Select(_ => Photo(Checker)).ToArray(), Settings(), Checker));

    [Fact]
    public void Normalize_RefusesADuplicate()
    {
        var photo = Photo(Checker);
        Assert.Throws<ValidationException>(() => TechnicalEvidencePhotos.Normalize([photo, photo], Settings(), Checker));
    }

    [Fact]
    public void Normalize_RefusesPhotosWhenCloudinaryIsOff() =>
        Assert.Throws<ValidationException>(() => TechnicalEvidencePhotos.Normalize([Photo(Checker)], new CloudinarySettings(), Checker));

    [Theory]
    [InlineData("someone-else")]
    [InlineData("other-cloud")]
    [InlineData("tour-cover")]
    [InlineData("http")]
    [InlineData("transformed")]
    [InlineData("blank")]
    public void Normalize_RefusesAnythingButTheCheckersOwnUpload(string kind)
    {
        var own = TechnicalEvidencePhotos.PublicIdFor(Checker, Guid.NewGuid());
        var url = kind switch
        {
            "someone-else" => Photo(Other),
            "other-cloud" => TechnicalEvidencePhotos.StoredUrl("another-cloud", own),
            "tour-cover" => $"https://res.cloudinary.com/demo-cloud/image/upload/smartcampus/tours/cover/{Guid.NewGuid():N}",
            "http" => TechnicalEvidencePhotos.StoredUrl("demo-cloud", own).Replace("https://", "http://", StringComparison.Ordinal),
            "transformed" => $"https://res.cloudinary.com/demo-cloud/image/upload/w_10/{own}",
            _ => " ",
        };
        Assert.Throws<ValidationException>(() => TechnicalEvidencePhotos.Normalize([url], Settings(), Checker));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{\"a\":1}")]
    public void Read_GivesNoPhotosForAMissingOrUnreadableValue(string? json) =>
        Assert.Empty(TechnicalEvidencePhotos.Read(json));

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
