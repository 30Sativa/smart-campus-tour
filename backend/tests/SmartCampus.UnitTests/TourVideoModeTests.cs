using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.SetTourVideoMode;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0075: the switch request and how the newest history event names the mode.</summary>
public sealed class TourVideoModeTests
{
    private static readonly SetTourVideoModeCommandValidator Validator = new();
    private static readonly SetTourVideoModeCommand Valid = new(Guid.NewGuid(), Guid.NewGuid(), TourVideoModes.Fallback, "Kính mất hình");

    [Fact]
    public void Validator_AcceptsLiveOrFallback_WithAReasonOfOneTo500Characters()
    {
        Assert.True(Validator.Validate(Valid).IsValid);
        Assert.True(Validator.Validate(Valid with { Mode = TourVideoModes.Live, Reason = new string('a', 500) }).IsValid);
        Assert.False(Validator.Validate(Valid with { Mode = "fallback" }).IsValid);
        Assert.False(Validator.Validate(Valid with { Mode = "AUTO" }).IsValid);
        Assert.False(Validator.Validate(Valid with { Reason = "   " }).IsValid);
        Assert.False(Validator.Validate(Valid with { Reason = new string('a', 501) }).IsValid);
        Assert.False(Validator.Validate(Valid with { Actor = Guid.Empty }).IsValid);
    }

    [Fact]
    public void Mode_IsTheNewestSwitch_AndLiveWithoutOne()
    {
        Assert.Equal(TourVideoModes.Live, TourVideoModes.Of(null));
        Assert.Equal(TourVideoModes.Fallback, TourVideoModes.Of(TourLifecycleEvents.VideoFallbackStarted));
        Assert.Equal(TourVideoModes.Live, TourVideoModes.Of(TourLifecycleEvents.VideoLiveRestored));
    }
}
