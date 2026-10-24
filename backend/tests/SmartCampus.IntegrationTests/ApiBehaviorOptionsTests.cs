using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.ExceptionHandling;

namespace SmartCampus.IntegrationTests;

public sealed class ApiBehaviorOptionsTests
{
    [Fact]
    public void InvalidModelState_UsesBaseResponseEnvelope()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddControllers().UseBaseResponseForInvalidModelState();
        using var serviceProvider = services.BuildServiceProvider();

        var options = serviceProvider.GetRequiredService<IOptions<ApiBehaviorOptions>>().Value;
        var modelState = new ModelStateDictionary();
        modelState.AddModelError("size", "The value 'invalid' is not valid.");
        var actionContext = new ActionContext(
            new DefaultHttpContext(),
            new RouteData(),
            new ActionDescriptor(),
            modelState);

        var responseFactory = options.InvalidModelStateResponseFactory;
        Assert.NotNull(responseFactory);
        var result = Assert.IsType<BadRequestObjectResult>(responseFactory(actionContext));
        var envelope = Assert.IsType<BaseResponse<object?>>(result.Value);
        var errors = Assert.IsAssignableFrom<IReadOnlyDictionary<string, string[]>>(envelope.Errors);

        Assert.False(envelope.Success);
        Assert.Equal("One or more validation errors occurred.", envelope.Message);
        Assert.Equal("The value 'invalid' is not valid.", Assert.Single(errors["size"]));
    }
}
