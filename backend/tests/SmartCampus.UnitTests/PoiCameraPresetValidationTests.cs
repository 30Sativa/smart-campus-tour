using FluentValidation;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

public sealed class PoiCameraPresetValidationTests
{
    private static PoiProposalDraft Draft(string camera) =>
        new(Guid.NewGuid(), "Library", "Entrance", null, 1m, 2m, 0m, camera, "Giới thiệu địa điểm.");

    public static TheoryData<IValidator, Func<string, object>> WritePaths => new()
    {
        { new CreatePoiProposalCommandValidator(), camera => new CreatePoiProposalCommand(Guid.NewGuid(), new(Guid.NewGuid(), Draft(camera))) },
        { new CreatePoiRevisionCommandValidator(), camera => new CreatePoiRevisionCommand(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), 1, "AAAA", Draft(camera))) },
    };

    [Theory]
    [MemberData(nameof(WritePaths))]
    public void Every_write_path_accepts_every_head_preset_in_any_case(IValidator validator, Func<string, object> command)
    {
        foreach (var camera in new[] { "FRONT", "LEFT", "RIGHT", "front", "Left", " right ", "NONE", "SWEEP", "sweep:90",
                     "SWEEP:10", "SWEEP:170", "ANGLE:45,-10", "angle:-170,18", "ANGLE:12.5,0" })
            Assert.True(validator.Validate(new ValidationContext<object>(command(camera))).IsValid, camera);
    }

    [Theory]
    [MemberData(nameof(WritePaths))]
    public void Every_write_path_refuses_anything_else_with_the_vietnamese_message(IValidator validator, Func<string, object> command)
    {
        foreach (var camera in new[] { "", " ", "UP", "HEAD_LEFT", "FRONT-LEFT", "SWEEP:9", "SWEEP:171", "SWEEP:", "SWEEP:90.5",
                     "SWEEP:-90", "ANGLE:171,0", "ANGLE:0,18.5", "ANGLE:1.25,0", "ANGLE:1e2,0", "ANGLE:5", "ANGLE:5,5,5",
                     "ANGLE:--5,0", "ANGLE:5-,0", "ANGLE:.5,0", "ANGLE:5.,0", "NONE:1" })
        {
            var failure = Assert.Single(validator.Validate(new ValidationContext<object>(command(camera))).Errors);
            Assert.Equal(PoiCameraPresets.InvalidMessage, failure.ErrorMessage);
            Assert.Equal(MapPoiErrorCodes.CameraPresetInvalid, failure.ErrorCode);
        }
    }

    [Theory]
    [InlineData(" front ", "FRONT")]
    [InlineData("sweep", "SWEEP")]
    [InlineData("Sweep:090", "SWEEP:90")]
    [InlineData("angle:45.0,-0", "ANGLE:45,0")]
    [InlineData("ANGLE:-0.5,18", "ANGLE:-0.5,18")]
    public void Presets_are_stored_in_one_canonical_form(string input, string stored) =>
        Assert.Equal(stored, PoiCameraPresets.Normalize(input));

    [Fact]
    public void The_side_presets_mean_ninety_degrees_and_left_is_positive()
    {
        Assert.Equal(new PoiCameraAction("LEFT", 90, 0, null), PoiCameraPresets.Parse("LEFT"));
        Assert.Equal(new PoiCameraAction("RIGHT", -90, 0, null), PoiCameraPresets.Parse("RIGHT"));
        Assert.Equal(new PoiCameraAction("NONE", null, null, null), PoiCameraPresets.Parse("none"));
    }
}
