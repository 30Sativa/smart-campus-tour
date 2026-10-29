using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

public sealed class PhysicalRobotCredentialCommandTests
{
    [Fact]
    public void CredentialCommandRequiresAnEightByteBase64RowVersion()
    {
        var validator = new IssuePhysicalRobotCredentialCommandValidator();
        var robotId = Guid.NewGuid();
        var valid = new IssuePhysicalRobotCredentialCommand(Guid.NewGuid(), robotId,
            Convert.ToBase64String(new byte[8]), Rotate: false);
        var invalid = valid with { ExpectedRowVersion = "not-a-rowversion" };

        Assert.True(validator.Validate(valid).IsValid);
        Assert.Contains(validator.Validate(invalid).Errors,
            failure => failure.PropertyName == nameof(valid.ExpectedRowVersion));
    }
}
