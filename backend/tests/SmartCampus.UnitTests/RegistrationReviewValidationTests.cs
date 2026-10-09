using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.RegistrationReview;
using SmartCampus.Application.Features.RegistrationReview.Commands;
using SmartCampus.Application.Features.RegistrationReview.Commands.ApproveRegistration;
using SmartCampus.Application.Features.RegistrationReview.Commands.RejectRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;
using SmartCampus.Application.Features.Representative;

namespace SmartCampus.UnitTests;

public sealed class RegistrationReviewValidationTests
{
    private static ReviewRequest Request(string? reason) => new("AAAAAAAAAAE=", "AAAAAAAAAAI=", reason);
    private static RejectRegistrationCommand Reject(string? reason = "Sửa danh sách") => new(Guid.NewGuid(), Guid.NewGuid(), Request(reason));
    private static ApproveRegistrationCommand Approve(string? reason = null) => new(Guid.NewGuid(), Guid.NewGuid(), Request(reason));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RejectRequiresNonblankReason(string? reason) =>
        Assert.False(new RejectRegistrationCommandValidator().Validate(Reject(reason)).IsValid);

    [Fact]
    public void BothDecisionsRequireSqlVersions_RejectReasonFitsSchema_ApprovalCarriesNoReason()
    {
        var reject = new RejectRegistrationCommandValidator();
        Assert.True(reject.Validate(Reject(new string('a', 1000))).IsValid);
        Assert.False(reject.Validate(Reject(new string('a', 1001))).IsValid);
        var approve = new ApproveRegistrationCommandValidator();
        Assert.True(approve.Validate(Approve()).IsValid);
        Assert.True(approve.Validate(Approve("   ")).IsValid);
        Assert.False(approve.Validate(Approve("Injected rejection")).IsValid);
        var command = Reject();
        Assert.False(reject.Validate(command with { Request = command.Request with { ExpectedRowVersion = "mock-version" } }).IsValid);
        var approval = Approve();
        Assert.False(approve.Validate(approval with { Request = approval.Request with { ExpectedTourRowVersion = "" } }).IsValid);
        Assert.False(approve.Validate(approval with { Id = Guid.Empty }).IsValid);
    }

    [Fact]
    public void ReviewGate_OnlySubmittedInAnOpenTourWithoutAccessHistory()
    {
        Assert.True(ReviewPolicy.Evaluate(RegistrationGate.OpenTourState, RegistrationStates.Submitted, false).Allowed);
        foreach (var state in new[] { RegistrationStates.Approved, RegistrationStates.Rejected, RegistrationStates.Cancelled })
            Assert.Equal(RegistrationGate.StateConflictCode, ReviewPolicy.Evaluate(RegistrationGate.OpenTourState, state, false).Code);
        Assert.Equal(RegistrationGate.InvitationBoundaryCode,
            ReviewPolicy.Evaluate(RegistrationGate.OpenTourState, RegistrationStates.Submitted, true).Code);
        var exception = Assert.Throws<ConflictException>(() =>
            ReviewPolicy.Evaluate("READY", RegistrationStates.Submitted, false).EnsureAllowed());
        Assert.Equal("TOUR_LOCKED", exception.Code);
    }

    [Fact]
    public void ReviewAndRepresentativeWrites_ShareTheTourWindow()
    {
        foreach (var tourState in new[] { "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            var review = ReviewPolicy.Evaluate(tourState, RegistrationStates.Submitted, false);
            var edit = RepresentativeRegistrationPolicy.Evaluate(tourState, RegistrationStates.Submitted, false, RegistrationOperation.Update);
            Assert.Equal(RegistrationGate.TourLocked, review);
            Assert.Equal(review, edit);
            Assert.Equal(new ActionGate(false, "Tour đã khóa đăng ký."), review.ToActionGate());
        }
    }

    [Theory]
    [InlineData("--submittedAt", null, 1, 20)]
    [InlineData("capacity", null, 1, 20)]
    [InlineData("submittedAt", "PENDING", 1, 20)]
    [InlineData("submittedAt", "submitted", 1, 20)]
    [InlineData("submittedAt", "SUBMITTED", 0, 20)]
    [InlineData("submittedAt", "SUBMITTED", 1, 101)]
    public void ListRejectsUnsupportedFilters(string sort, string? state, int page, int size) =>
        Assert.False(new ListRegistrationsQueryValidator().Validate(new ListRegistrationsQuery(new(Sort: sort, State: state, Page: page, Size: size))).IsValid);
}
