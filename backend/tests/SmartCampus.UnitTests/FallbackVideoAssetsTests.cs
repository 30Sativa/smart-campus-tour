using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0063: fallback videos are Cloudinary authenticated assets signed only by the backend.</summary>
public sealed class FallbackVideoAssetsTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(1_794_900_000);
    private static CloudinarySettings Settings() => new("demo-cloud", "123456789012345", "test-secret");

    [Fact]
    public void DeliverySignature_MatchesCloudinarysDocumentedExample() =>
        // https://cloudinary.com/documentation/delivery_url_signatures: secret "abcd".
        Assert.Equal("iDy_JeBq", FallbackVideoAssets.DeliverySignature("c_fill,w_300,h_250/e_grayscale/sample-authenticated.png", "abcd"));

    [Fact]
    public void UploadSignature_MatchesCloudinarysDocumentedExample() =>
        // https://cloudinary.com/documentation/authentication_signatures: secret "abcd", parameters in any order.
        Assert.Equal("bfd09f95f331f558cbd1320e67aa8d488770583e", FallbackVideoAssets.UploadSignature(
            new Dictionary<string, string>
            {
                ["timestamp"] = "1315060510",
                ["public_id"] = "sample_image",
                ["eager"] = "w_400,h_300,c_pad|w_260,h_200,c_crop",
            }, "abcd"));

    [Fact]
    public async Task UploadFields_SignAnAuthenticatedEagerUploadUnderAFreshPublicId()
    {
        var handler = new GetFallbackVideoUploadQueryHandler(Settings(), new FixedClock(Now));
        var first = await handler.Handle(new GetFallbackVideoUploadQuery(), default);
        var second = await handler.Handle(new GetFallbackVideoUploadQuery(), default);

        Assert.Equal("https://api.cloudinary.com/v1_1/demo-cloud/video/upload", first.UploadUrl);
        Assert.Equal("authenticated", first.Fields["type"]);
        Assert.Equal(FallbackVideoAssets.Delivery + "/mp4", first.Fields["eager"]);
        Assert.Equal("123456789012345", first.Fields["api_key"]);
        Assert.Equal("1794900000", first.Fields["timestamp"]);
        Assert.DoesNotContain(first.Fields.Values, value => value.Contains("test-secret", StringComparison.Ordinal));
        Assert.NotEqual(first.Fields["public_id"], second.Fields["public_id"]);

        var signed = first.Fields.Where(pair => pair.Key is not ("api_key" or "signature"))
            .ToDictionary(pair => pair.Key, pair => pair.Value);
        Assert.Equal(FallbackVideoAssets.UploadSignature(signed, "test-secret"), first.Fields["signature"]);
        Assert.Equal($"https://res.cloudinary.com/demo-cloud/video/authenticated/{first.Fields["public_id"]}.mp4", first.StoredUrl);
        Assert.Equal(first.Fields["public_id"], FallbackVideoAssets.PublicIdOf("demo-cloud", first.StoredUrl));
    }

    [Fact]
    public async Task Upload_IsUnavailableWithoutCloudinary()
    {
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            new GetFallbackVideoUploadQueryHandler(new CloudinarySettings(), new FixedClock(Now)).Handle(new GetFallbackVideoUploadQuery(), default));
        Assert.Equal(GetFallbackVideoUploadQueryHandler.Unavailable, error.Code);
    }

    [Theory]
    [InlineData("https://res.cloudinary.com/demo-cloud/video/upload/smartcampus/tours/fallback/0123456789abcdef0123456789abcdef.mp4")]
    [InlineData("https://res.cloudinary.com/demo-cloud/video/authenticated/v12/smartcampus/tours/fallback/0123456789abcdef0123456789abcdef.mp4")]
    [InlineData("https://res.cloudinary.com/demo-cloud/video/authenticated/smartcampus/other/0123456789abcdef0123456789abcdef.mp4")]
    [InlineData("https://evil.test/demo-cloud/video/authenticated/smartcampus/tours/fallback/0123456789abcdef0123456789abcdef.mp4")]
    [InlineData("https://example.test/video.mp4")]
    [InlineData(null)]
    public void PublicIdOf_AcceptsOnlyTheReferenceAnUploadMade(string? url) =>
        Assert.Null(FallbackVideoAssets.PublicIdOf("demo-cloud", url));

    [Fact]
    public void Settings_AreAllOrNothing()
    {
        Assert.False(new CloudinarySettings().Enabled);
        Assert.True(Settings().Enabled);
        Assert.Equal("demo-cloud", new CloudinarySettings("Demo-Cloud", "k", "s").CloudName);
        Assert.Throws<InvalidOperationException>(() => new CloudinarySettings("demo-cloud", "k", null));
        Assert.Throws<InvalidOperationException>(() => new CloudinarySettings("1bad", "k", "s"));
        Assert.Throws<InvalidOperationException>(() => new CloudinarySettings("bad/name", "k", "s"));
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
