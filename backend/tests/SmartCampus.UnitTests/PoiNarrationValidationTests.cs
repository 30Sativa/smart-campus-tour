using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

public sealed class PoiNarrationValidationTests
{
    private static CreatePoiProposalCommand Command(PoiProposalDraft draft) => new(Guid.NewGuid(),
        new CreatePoiProposalRequest(Guid.NewGuid(), draft));

    private static PoiProposalDraft Draft(string? narration = "Giới thiệu địa điểm.", string? video = null) =>
        new(Guid.NewGuid(), "Library", "Entrance", null, 1m, 2m, 0m, "FRONT", narration, video);

    [Fact]
    public void Narration_is_required_and_bounded_to_4000_characters()
    {
        var validator = new CreatePoiProposalCommandValidator();
        Assert.True(validator.Validate(Command(Draft(new string('x', 4000)))).IsValid);
        Assert.False(validator.Validate(Command(Draft(null))).IsValid);
        Assert.False(validator.Validate(Command(Draft("  "))).IsValid);
        Assert.False(validator.Validate(Command(Draft(new string('x', 4001)))).IsValid);
    }

    [Fact]
    public void Fallback_video_is_optional_bounded_and_https_only()
    {
        var validator = new CreatePoiProposalCommandValidator();
        Assert.True(validator.Validate(Command(Draft(video: null))).IsValid);
        Assert.True(validator.Validate(Command(Draft(video: "https://example.test/video"))).IsValid);
        Assert.False(validator.Validate(Command(Draft(video: "http://example.test/video"))).IsValid);
        Assert.False(validator.Validate(Command(Draft(video: "file:///tmp/video"))).IsValid);
        var maxUrl = "https://example.test/" + new string('a', 2048 - "https://example.test/".Length);
        Assert.True(validator.Validate(Command(Draft(video: maxUrl))).IsValid);
        Assert.False(validator.Validate(Command(Draft(video: maxUrl + "a"))).IsValid);
    }
}
