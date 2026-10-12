using SmartCampus.Application.Features.Representative;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.UnitTests;

public sealed class RepresentativeValidationTests
{
    private static RegistrationInput Valid() => new(new string('s', 200), new string('g', 200),
        new string('c', 150), "contact@example.com", "AAAAAAAAAAE=",
        [new(2, "SHARED_VIEWING", new string('n', 150), " ROOM@example.com ", new string('l', 100))]);

    [Fact]
    public void SharedOnlyGroup_AcceptsSchemaLengthsAndTrimmedEmail()
    {
        Assert.True(new RegistrationInputValidator().Validate(Valid()).IsValid);
    }

    [Fact]
    public void InvalidAndDuplicateRows_ReportIndexedErrorsAndDoNotRequireDistinctNames()
    {
        var input = Valid() with
        {
            Roster = [new(2, "INDIVIDUAL", "Same", "same@example.com", null),
                new(2, "SHARED_VIEWING", "Same", " SAME@EXAMPLE.COM ", null)]
        };
        var result = new RegistrationInputValidator().Validate(input);
        Assert.Contains(result.Errors, e => e.PropertyName == "Roster[1].Email");
        Assert.Contains(result.Errors, e => e.PropertyName == "Roster[1].RowNumber");
        Assert.DoesNotContain(result.Errors, e => e.PropertyName.Contains("DisplayName"));
        Assert.False(new RegistrationInputValidator().Validate(input with { Roster = [] }).IsValid);
        Assert.False(new RegistrationInputValidator().Validate(input with { GroupName = " " }).IsValid);
        Assert.False(new RegistrationInputValidator().Validate(input with { ExpectedTourRowVersion = "old-mock-version" }).IsValid);
    }

    [Theory]
    [InlineData("a b@example.com")]
    [InlineData("a@@example.com")]
    [InlineData("missing-at")]
    [InlineData("a@example.com\r\nbcc@example.com")]
    public void EmailSyntax_RejectsMalformedInvitationAddresses(string email)
    {
        var input = Valid() with { Roster = [new(2, "INDIVIDUAL", "Viewer", email, null)] };
        Assert.Contains(new RegistrationInputValidator().Validate(input).Errors, e => e.PropertyName == "Roster[0].Email");
    }

    [Fact]
    public void CollectionSort_RejectsMalformedDirectionInsteadOfSilentlyUsingTheDefault()
    {
        var tours = new GetRepresentativeToursQueryValidator();
        var registrations = new GetRepresentativeRegistrationsQueryValidator();
        Assert.True(tours.Validate(new GetRepresentativeToursQuery(Guid.NewGuid(), new(Sort: "-name"))).IsValid);
        Assert.False(tours.Validate(new GetRepresentativeToursQuery(Guid.NewGuid(), new(Sort: "--name"))).IsValid);
        Assert.True(registrations.Validate(new GetRepresentativeRegistrationsQuery(Guid.NewGuid(), new(Sort: "-updatedAt"))).IsValid);
        Assert.False(registrations.Validate(new GetRepresentativeRegistrationsQuery(Guid.NewGuid(), new(Sort: "--updatedAt"))).IsValid);
    }

    [Fact]
    public void RepresentativeGatesShareOneStateMatrixForActionsAndMutations()
    {
        const string open = RegistrationGate.OpenTourState;
        static bool Allowed(string tour, string state, bool invitations, RegistrationOperation operation) =>
            RepresentativeRegistrationPolicy.Evaluate(tour, state, invitations, operation).Allowed;

        Assert.True(Allowed(open, string.Empty, false, RegistrationOperation.Create));
        Assert.False(Allowed("READY", string.Empty, false, RegistrationOperation.Create));

        Assert.True(Allowed(open, RegistrationStates.Submitted, false, RegistrationOperation.Update));
        Assert.True(Allowed(open, RegistrationStates.Submitted, false, RegistrationOperation.Cancel));
        Assert.False(Allowed(open, RegistrationStates.Submitted, false, RegistrationOperation.Resubmit));

        Assert.True(Allowed(open, RegistrationStates.Rejected, false, RegistrationOperation.Resubmit));
        Assert.True(Allowed(open, RegistrationStates.Rejected, false, RegistrationOperation.Cancel));
        Assert.False(Allowed(open, RegistrationStates.Rejected, false, RegistrationOperation.Update));

        Assert.True(Allowed(open, RegistrationStates.Cancelled, false, RegistrationOperation.Resubmit));
        Assert.False(Allowed(open, RegistrationStates.Cancelled, false, RegistrationOperation.Update));
        Assert.False(Allowed(open, RegistrationStates.Cancelled, false, RegistrationOperation.Cancel));

        foreach (var operation in new[] { RegistrationOperation.Update, RegistrationOperation.Resubmit, RegistrationOperation.Cancel })
        {
            Assert.False(Allowed(open, RegistrationStates.Submitted, true, operation));
            Assert.False(Allowed("RUNNING", RegistrationStates.Submitted, false, operation));
            var approved = RepresentativeRegistrationPolicy.Evaluate(open, RegistrationStates.Approved, false, operation);
            Assert.False(approved.Allowed);
            Assert.Equal(RepresentativeRegistrationPolicy.ApprovedBoundary, approved.ToActionGate().Reason);
        }
        var exception = Assert.Throws<ConflictException>(() => RepresentativeRegistrationPolicy.Evaluate(
            open, RegistrationStates.Approved, false, RegistrationOperation.Cancel).EnsureAllowed());
        Assert.Equal("INVITATION_BOUNDARY", exception.Code);
        var stale = Assert.Throws<ConflictException>(() => RowVersionToken.EnsureCurrent([0, 0, 0, 0, 0, 0, 0, 2], "AAAAAAAAAAE="));
        Assert.Equal("STALE_VERSION", stale.Code);
    }
}
