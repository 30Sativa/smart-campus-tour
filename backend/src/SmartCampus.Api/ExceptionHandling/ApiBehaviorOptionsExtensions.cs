using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Api.Common.Responses;

namespace SmartCampus.Api.ExceptionHandling;

public static class ApiBehaviorOptionsExtensions
{
    public static IMvcBuilder UseBaseResponseForInvalidModelState(
        this IMvcBuilder builder)
    {
        return builder.ConfigureApiBehaviorOptions(options =>
        {
            options.InvalidModelStateResponseFactory = context =>
            {
                var errors = context.ModelState
                    .Where(entry => entry.Value?.Errors.Count > 0)
                    .ToDictionary(
                        entry => entry.Key,
                        entry => entry.Value!.Errors
                            .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                                ? "The supplied value is invalid."
                                : error.ErrorMessage)
                            .ToArray());

                return new BadRequestObjectResult(new BaseResponse<object?>
                {
                    Success = false,
                    Message = "One or more validation errors occurred.",
                    Data = null,
                    Errors = errors
                });
            };
        });
    }
}
