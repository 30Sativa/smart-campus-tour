using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;
using SmartCampus.Application.Features.TourCoverImage;

namespace SmartCampus.UnitTests;

/// <summary>A Tour's cover image: a public Cloudinary image under a public ID fixed by the Tour, signed only by the backend.</summary>
public sealed class TourCoverImagesTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(1_794_900_000);
    private static readonly Guid TourId = Guid.Parse("e7f145d4-3e04-4540-985a-29d8222d75af");
    private static CloudinarySettings Settings() => new("demo-cloud", "123456789012345", "test-secret");

    [Fact]
    public void UploadFields_SignAnOverwritingUploadUnderTheTourPublicId()
    {
        var fields = TourCoverImages.UploadFields(Settings(), TourId, Now);

        Assert.Equal("smartcampus/tours/cover/e7f145d43e044540985a29d8222d75af", fields["public_id"]);
        Assert.Equal("true", fields["overwrite"]);
        Assert.Equal("true", fields["invalidate"]);
        Assert.Equal(TourCoverImages.AllowedFormats, fields["allowed_formats"]);
        Assert.Equal("1794900000", fields["timestamp"]);
        Assert.Equal("123456789012345", fields["api_key"]);
        // A public image: no `type`, so Cloudinary's default `upload` delivery type.
        Assert.False(fields.ContainsKey("type"));
        Assert.DoesNotContain(fields.Values, value => value.Contains("test-secret", StringComparison.Ordinal));

        var signed = fields.Where(pair => pair.Key is not ("api_key" or "signature")).ToDictionary(pair => pair.Key, pair => pair.Value);
        Assert.Equal(FallbackVideoAssets.UploadSignature(signed, "test-secret"), fields["signature"]);
    }

    [Fact]
    public void UploadFields_AreTheSameForTheSameTour() =>
        Assert.Equal(TourCoverImages.UploadFields(Settings(), TourId, Now)["public_id"],
            TourCoverImages.UploadFields(Settings(), TourId, Now.AddMinutes(5))["public_id"]);

    [Fact]
    public async Task Upload_IsUnavailableWithoutCloudinary()
    {
        // Refused before the Tour is looked up, so no repository is needed here.
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            new GetTourCoverImageUploadQueryHandler(new CloudinarySettings(), null!, new FixedClock(Now))
                .Handle(new GetTourCoverImageUploadQuery(TourId), default));
        Assert.Equal(GetTourCoverImageUploadQueryHandler.Unavailable, error.Code);
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
