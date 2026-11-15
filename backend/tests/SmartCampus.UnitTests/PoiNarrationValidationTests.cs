using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0060: narration is validated on its own draft request; POI proposals no longer carry it.</summary>
public sealed class PoiNarrationValidationTests
{
    private static SavePoiNarrationDraftCommand Command(string narration = "Giới thiệu địa điểm.", string? video = null,
        Guid? requestId = null) =>
        new(Guid.NewGuid(), Guid.NewGuid(), new SavePoiNarrationDraftRequest(requestId ?? Guid.NewGuid(), null, narration, video));

    [Fact]
    public void Narration_is_required_and_bounded_to_4000_characters()
    {
        var validator = new SavePoiNarrationDraftCommandValidator();
        Assert.True(validator.Validate(Command(new string('x', 4000))).IsValid);
        Assert.True(validator.Validate(Command("  " + new string('x', 4000) + "  ")).IsValid);
        Assert.False(validator.Validate(Command(null!)).IsValid);
        Assert.False(validator.Validate(Command("  ")).IsValid);
        Assert.False(validator.Validate(Command(new string('x', 4001))).IsValid);
    }

    [Fact]
    public void Fallback_video_is_optional_bounded_and_https_only()
    {
        var validator = new SavePoiNarrationDraftCommandValidator();
        Assert.True(validator.Validate(Command(video: null)).IsValid);
        Assert.True(validator.Validate(Command(video: "https://example.test/video")).IsValid);
        Assert.False(validator.Validate(Command(video: "http://example.test/video")).IsValid);
        Assert.False(validator.Validate(Command(video: "file:///tmp/video")).IsValid);
        Assert.False(validator.Validate(Command(video: "https://user:secret@example.test/video")).IsValid);
        var maxUrl = "https://example.test/" + new string('a', 2048 - "https://example.test/".Length);
        Assert.True(validator.Validate(Command(video: maxUrl)).IsValid);
        Assert.False(validator.Validate(Command(video: maxUrl + "a")).IsValid);
    }

    [Fact]
    public void Draft_needs_a_request_id_and_state_changes_need_a_version()
    {
        Assert.False(new SavePoiNarrationDraftCommandValidator().Validate(Command(requestId: Guid.Empty)).IsValid);
        var approve = new ApprovePoiNarrationCommandValidator().Validate(
            new ApprovePoiNarrationCommand(Guid.NewGuid(), Guid.NewGuid(), 0, new(Guid.Empty, "")));
        Assert.Equal(3, approve.Errors.Count);
        var discard = new DiscardPoiNarrationCommandValidator().Validate(
            new DiscardPoiNarrationCommand(Guid.NewGuid(), Guid.NewGuid(), 0, new(Guid.Empty, "")));
        Assert.Equal(3, discard.Errors.Count);
    }

    [Fact]
    public void A_poi_proposal_is_valid_without_narration()
    {
        var draft = new PoiProposalDraft(Guid.NewGuid(), "Library", "Entrance", null, 1m, 2m, 0m, "FRONT");
        Assert.True(new CreatePoiProposalCommandValidator().Validate(
            new CreatePoiProposalCommand(Guid.NewGuid(), new CreatePoiProposalRequest(Guid.NewGuid(), draft))).IsValid);
    }
}
