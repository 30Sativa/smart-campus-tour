using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Exceptions;

namespace SmartCampus.Api.ExceptionHandling;

public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, message, errors) = exception switch
        {
            ValidationException validationException => (
                StatusCodes.Status400BadRequest,
                "One or more validation errors occurred.",
                CreateValidationErrors(validationException)),
            DomainException domainException => (
                StatusCodes.Status400BadRequest,
                domainException.Message,
                null),
            NotFoundException notFoundException => (
                StatusCodes.Status404NotFound,
                notFoundException.Message,
                null),
            ConflictException conflictException => (
                StatusCodes.Status409Conflict,
                conflictException.Message,
                null),
            _ => (
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred.",
                null)
        };

        if (statusCode == StatusCodes.Status500InternalServerError)
        {
            logger.LogError(
                "An unhandled exception of type {ExceptionType} occurred.",
                exception.GetType().FullName);
        }

        httpContext.Response.StatusCode = statusCode;

        var response = new BaseResponse<object?>
        {
            Success = false,
            Message = message,
            Data = null,
            Errors = errors
        };

        await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);

        return true;
    }

    private static IReadOnlyDictionary<string, string[]> CreateValidationErrors(
        ValidationException exception)
    {
        return exception.Errors
            .GroupBy(failure => failure.PropertyName)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(failure => failure.ErrorMessage)
                    .Distinct()
                    .ToArray());
    }
}
