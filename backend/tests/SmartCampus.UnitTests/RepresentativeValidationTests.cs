using SmartCampus.Application.Features.Representative.Commands;
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
    public void RegistrationActionsAndMutationGateShareTheSameStateMatrix()
    {
        var create = RepresentativeRegistrationPolicy.Gate(RegistrationConsistency.Scheduled, string.Empty, false, RegistrationOperation.Create);
        Assert.True(create.Allowed);
        Assert.False(RepresentativeRegistrationPolicy.Gate("READY", string.Empty, false, RegistrationOperation.Create).Allowed);

        var submitted = RepresentativeRegistrationPolicy.Actions(RegistrationConsistency.Scheduled, RegistrationConsistency.Submitted, false);
        Assert.True(submitted.Edit.Allowed);
        Assert.True(submitted.Cancel.Allowed);
        Assert.False(submitted.Resubmit.Allowed);

        var rejected = RepresentativeRegistrationPolicy.Actions(RegistrationConsistency.Scheduled, RegistrationConsistency.Rejected, false);
        Assert.True(rejected.Resubmit.Allowed);
        Assert.True(rejected.Cancel.Allowed);
        Assert.False(rejected.Edit.Allowed);

        var cancelled = RepresentativeRegistrationPolicy.Actions(RegistrationConsistency.Scheduled, RegistrationConsistency.Cancelled, false);
        Assert.True(cancelled.Resubmit.Allowed);
        Assert.False(cancelled.Edit.Allowed);
        Assert.False(cancelled.Cancel.Allowed);

        var withInvitations = RepresentativeRegistrationPolicy.Actions(RegistrationConsistency.Scheduled, RegistrationConsistency.Submitted, true);
        Assert.False(withInvitations.Edit.Allowed);
        Assert.False(withInvitations.Resubmit.Allowed);
        Assert.False(withInvitations.Cancel.Allowed);

        var locked = RepresentativeRegistrationPolicy.Actions("RUNNING", RegistrationConsistency.Submitted, false);
        Assert.False(locked.Edit.Allowed);
        Assert.False(locked.Resubmit.Allowed);
        Assert.False(locked.Cancel.Allowed);

        var approved = RepresentativeRegistrationPolicy.Actions(RegistrationConsistency.Scheduled, RegistrationConsistency.Approved, false);
        Assert.False(approved.Edit.Allowed);
        Assert.False(approved.Resubmit.Allowed);
        Assert.False(approved.Cancel.Allowed);
        Assert.Equal(RepresentativeRegistrationPolicy.ApprovedBoundary, approved.Edit.Reason);
        var exception = Assert.Throws<ConflictException>(() => RepresentativeRegistrationPolicy.RequireAllowed(
            RegistrationConsistency.Scheduled, RegistrationConsistency.Approved, false, RegistrationOperation.Cancel));
        Assert.Equal("INVITATION_BOUNDARY", exception.Code);
    }
}
