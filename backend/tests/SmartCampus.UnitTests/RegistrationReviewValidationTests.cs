using SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

namespace SmartCampus.UnitTests;

public sealed class RegistrationReviewValidationTests
{
    private static ReviewRegistrationCommand Command(bool approve = false, string? reason = "Sửa danh sách") =>
        new(Guid.NewGuid(), Guid.NewGuid(), approve, new("AAAAAAAAAAE=", "AAAAAAAAAAI=", reason));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RejectRequiresNonblankReason(string? reason) =>
        Assert.False(new ReviewRegistrationCommandValidator().Validate(Command(reason: reason)).IsValid);

    [Fact]
    public void ReviewRequiresBothSqlVersionsAndRejectReasonFitsSchema()
    {
        var validator = new ReviewRegistrationCommandValidator();
        Assert.True(validator.Validate(Command(reason: new string('a', 1000))).IsValid);
        Assert.False(validator.Validate(Command(reason: new string('a', 1001))).IsValid);
        Assert.True(validator.Validate(Command(true, null)).IsValid);
        Assert.False(validator.Validate(Command(true, "Injected rejection")).IsValid);
        var command = Command();
        Assert.False(validator.Validate(command with { Request = command.Request with { ExpectedRowVersion = "mock-version" } }).IsValid);
        Assert.False(validator.Validate(command with { Request = command.Request with { ExpectedTourRowVersion = "" } }).IsValid);
    }

    [Theory]
    [InlineData("--submittedAt", null, 1, 20)]
    [InlineData("capacity", null, 1, 20)]
    [InlineData("submittedAt", "PENDING", 1, 20)]
    [InlineData("submittedAt", "SUBMITTED", 0, 20)]
    [InlineData("submittedAt", "SUBMITTED", 1, 101)]
    public void ListRejectsUnsupportedFilters(string sort, string? state, int page, int size) =>
        Assert.False(new ListRegistrationsQueryValidator().Validate(new ListRegistrationsQuery(new(Sort: sort, State: state, Page: page, Size: size))).IsValid);
}
