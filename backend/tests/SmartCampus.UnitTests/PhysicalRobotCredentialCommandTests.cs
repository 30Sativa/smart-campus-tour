using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.RobotCredentials;

namespace SmartCampus.UnitTests;

public sealed class PhysicalRobotCredentialCommandTests
{
    [Fact]
    public void CredentialCommandRequiresAnEightByteBase64RowVersion()
    {
        var validator = new ChangeRobotCredentialCommandValidator();
        var valid = new ChangeRobotCredentialCommand("amr-01", Guid.NewGuid(), Guid.NewGuid(),
            Convert.ToBase64String(new byte[8]), null, RobotCredentialOperation.Issue);
        var invalid = valid with { ExpectedRowVersion = "not-a-rowversion" };

        Assert.True(validator.Validate(valid).IsValid);
        Assert.Contains(validator.Validate(invalid).Errors,
            failure => failure.PropertyName == nameof(valid.ExpectedRowVersion));
    }

    [Fact]
    public void RevocationRequiresReasonAndCredentialOperationsRequireARequestId()
    {
        var validator = new ChangeRobotCredentialCommandValidator();
        var revoke = new ChangeRobotCredentialCommand("amr-01", Guid.NewGuid(), Guid.NewGuid(),
            Convert.ToBase64String(new byte[8]), " ", RobotCredentialOperation.Revoke);

        Assert.Contains(validator.Validate(revoke).Errors, failure => failure.PropertyName == nameof(revoke.Reason));
        Assert.Contains(validator.Validate(revoke with { RequestId = Guid.Empty }).Errors,
            failure => failure.PropertyName == nameof(revoke.RequestId));
        Assert.True(validator.Validate(revoke with { Reason = "compromised" }).IsValid);
    }
}
