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
    public void Every_write_path_accepts_the_three_presets_in_any_case(IValidator validator, Func<string, object> command)
    {
        foreach (var camera in new[] { "FRONT", "LEFT", "RIGHT", "front", "Left", " right " })
            Assert.True(validator.Validate(new ValidationContext<object>(command(camera))).IsValid, camera);
    }

    [Theory]
    [MemberData(nameof(WritePaths))]
    public void Every_write_path_refuses_anything_else_with_the_vietnamese_message(IValidator validator, Func<string, object> command)
    {
        foreach (var camera in new[] { "", " ", "UP", "HEAD_LEFT", "FRONT-LEFT" })
        {
            var failure = Assert.Single(validator.Validate(new ValidationContext<object>(command(camera))).Errors);
            Assert.Equal("Hướng camera chỉ được là Phía trước, Bên trái hoặc Bên phải.", failure.ErrorMessage);
            Assert.Equal(MapPoiErrorCodes.CameraPresetInvalid, failure.ErrorCode);
        }
    }
}
