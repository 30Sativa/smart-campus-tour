using SmartCampus.Application.Features.RosterEmailCorrection;
using SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;

namespace SmartCampus.UnitTests;

public sealed class RosterEmailCorrectionValidationTests
{
    [Theory]
    [InlineData("SCHEDULED", "SUBMITTED", false, false, true)]
    [InlineData("SCHEDULED", "REJECTED", false, false, true)]
    [InlineData("SCHEDULED", "APPROVED", true, true, true)]
    [InlineData("SCHEDULED", "APPROVED", false, false, false)]
    [InlineData("SCHEDULED", "REJECTED", true, true, false)]
    [InlineData("SCHEDULED", "SUBMITTED", true, true, false)]
    [InlineData("SCHEDULED", "CANCELLED", false, true, false)]
    [InlineData("SCHEDULED", "UNKNOWN", false, true, false)]
    [InlineData("READY", "APPROVED", true, true, false)]
    [InlineData("RUNNING", "APPROVED", true, true, false)]
    [InlineData("COMPLETED", "SUBMITTED", false, true, false)]
    [InlineData("CANCELLED", "SUBMITTED", false, true, false)]
    public void CorrectionGate_UsesScheduledWindowAndEligibleRegistrationStates(string tour, string registration,
        bool history, bool enabled, bool allowed) =>
        Assert.Equal(allowed, EmailCorrectionPolicy.Evaluate(tour, registration, history, enabled).Allowed);

    [Fact]
    public void CorrectionInput_UsesExistingEmailAndVersionRules_AndRequiresRequestIdentity()
    {
        const string version = "AAAAAAAAAAE=";
        var validator = new CorrectRosterEmailCommandValidator();
        var request = new CorrectRosterEmailRequest(Guid.NewGuid(), " Viewer@Example.Test ", version, version, version);
        var command = new CorrectRosterEmailCommand(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), request);
        Assert.True(validator.Validate(command).IsValid);
        foreach (var invalid in new[] { request with { RequestId = Guid.Empty }, request with { Email = "bad" },
            request with { Email = "a b@example.test" }, request with { ExpectedRosterRowVersion = "bad" },
            request with { ExpectedInvitationRowVersion = "bad" } })
            Assert.False(validator.Validate(command with { Request = invalid }).IsValid);
    }
}
