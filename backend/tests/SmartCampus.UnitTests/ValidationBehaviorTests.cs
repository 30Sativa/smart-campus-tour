using FluentValidation;
using SmartCampus.Application.Common.Behaviors;

namespace SmartCampus.UnitTests;

public sealed class ValidationBehaviorTests
{
    [Fact]
    public async Task Handle_InvalidRequest_UsesAsyncValidatorAndSkipsHandler()
    {
        var validator = new InlineValidator<TestRequest>();
        validator.RuleFor(request => request.Value)
            .MustAsync((value, _) => Task.FromResult(!string.IsNullOrWhiteSpace(value)))
            .WithMessage("Value is required.");
        var behavior = new ValidationBehavior<TestRequest, string>([validator]);
        var handlerCalled = false;

        var exception = await Assert.ThrowsAsync<ValidationException>(() =>
            behavior.Handle(
                new TestRequest(string.Empty),
                _ =>
                {
                    handlerCalled = true;
                    return Task.FromResult("handled");
                },
                CancellationToken.None));

        Assert.False(handlerCalled);
        Assert.Contains(
            exception.Errors,
            failure => failure.PropertyName == nameof(TestRequest.Value));
    }

    private sealed record TestRequest(string Value);
}
