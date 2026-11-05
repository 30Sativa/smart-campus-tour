using FluentValidation;
using System.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Diagnostics;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
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
            _ when IsPendingEmailChangeUniqueViolation(exception) => (
                StatusCodes.Status409Conflict,
                "Dòng này đã có yêu cầu đổi email đang chờ Staff xử lý.",
                (object?)new { code = "EMAIL_CHANGE_PENDING" }),
            _ when IsRobotCodeUniqueViolation(exception) => (
                StatusCodes.Status409Conflict,
                "Mã robot đã được đăng ký. Kiểm tra lại mã robot trước khi thử lại.",
                (object?)new { code = "ROBOT_CODE_CONFLICT" }),
            _ when IsMapPackageUniqueViolation(exception) => (
                StatusCodes.Status409Conflict,
                "Gói này đã được tải lên ở khu vực này.",
                (object?)new { code = "MAP_PACKAGE_DUPLICATE" }),
            ValidationException validationException when UnprocessableFailure(validationException) is { } failure => (
                StatusCodes.Status422UnprocessableEntity,
                failure.ErrorMessage,
                (object?)new { code = failure.ErrorCode }),
            ValidationException validationException => (
                StatusCodes.Status400BadRequest,
                "One or more validation errors occurred.",
                CreateValidationErrors(validationException)),
            DomainException domainException => (
                StatusCodes.Status400BadRequest,
                domainException.Message,
                null),
            UnauthorizedException unauthorizedException => (
                StatusCodes.Status401Unauthorized,
                unauthorizedException.Message,
                null),
            ForbiddenException forbiddenException => (
                StatusCodes.Status403Forbidden,
                forbiddenException.Message,
                null),
            NotFoundException notFoundException => (
                StatusCodes.Status404NotFound,
                notFoundException.Message,
                notFoundException.Code is null ? null : (object?)new { code = notFoundException.Code }),
            ConflictException { Checks: not null } conflictException => (
                StatusCodes.Status409Conflict,
                conflictException.Message,
                (object?)new
                {
                    code = conflictException.Code,
                    checks = conflictException.Checks.Select(c => new { id = c.Id, passed = c.Passed, source = c.Source, detail = c.Detail }),
                    blockedBy = conflictException.BlockedBy ?? []
                }),
            ConflictException { Blockers: not null } conflictException => (
                StatusCodes.Status409Conflict,
                conflictException.Message,
                (object?)new
                {
                    code = conflictException.Code,
                    blockers = conflictException.Blockers.Select(b => new { code = b.Code, message = b.Message })
                }),
            ConflictException conflictException => (
                StatusCodes.Status409Conflict,
                conflictException.Message,
                conflictException.Code == "CONFLICT" && conflictException.FieldErrors is null
                    ? null
                    : (object?)new
                    {
                        code = conflictException.Code,
                        fields = conflictException.FieldErrors
                    }),
            TooManyRequestsException tooMany => (
                StatusCodes.Status429TooManyRequests,
                tooMany.Message,
                (object?)new { code = tooMany.Code }),
            ServiceUnavailableException unavailable => (
                StatusCodes.Status503ServiceUnavailable,
                unavailable.Message,
                (object?)new { code = unavailable.Code }),
            GatewayTimeoutException timeout => (
                StatusCodes.Status504GatewayTimeout,
                timeout.Message,
                (object?)new { code = timeout.Code }),
            _ => (
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred.",
                null)
        };

        if (statusCode == StatusCodes.Status500InternalServerError)
        {
            logger.LogError(
                "Request {TraceId} failed with {ExceptionType}; SQL error {SqlNumber}.",
                Activity.Current?.TraceId.ToString() ?? httpContext.TraceIdentifier,
                exception.GetType().FullName, SqlNumber(exception));
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

    private static int? SqlNumber(Exception error) => error is SqlException sql ? sql.Number :
        error.InnerException is null ? null : SqlNumber(error.InnerException);

    private static bool IsPendingEmailChangeUniqueViolation(Exception error) =>
        (error is SqlException { Number: 2601 or 2627 } sql &&
         sql.Message.Contains("UX_RosterEmailChangeRequests_OnePending", StringComparison.Ordinal)) ||
        (error.InnerException is not null && IsPendingEmailChangeUniqueViolation(error.InnerException));

    private static bool IsMapPackageUniqueViolation(Exception error) =>
        (error is SqlException { Number: 2601 or 2627 } sql &&
         sql.Message.Contains("UX_MapVersions_Area_PackageSha256", StringComparison.Ordinal)) ||
        (error.InnerException is not null && IsMapPackageUniqueViolation(error.InnerException));

    private static FluentValidation.Results.ValidationFailure? UnprocessableFailure(ValidationException exception) =>
        exception.Errors.FirstOrDefault(failure =>
            failure.ErrorCode is MapPoiErrorCodes.CameraPresetInvalid or MapPoiErrorCodes.PoseClearanceInsufficient);

    private static bool IsRobotCodeUniqueViolation(Exception error) =>
        (error is SqlException { Number: 2601 or 2627 } sql &&
         sql.Message.Contains("UQ_Robots_RobotCode", StringComparison.Ordinal)) ||
        (error.InnerException is not null && IsRobotCodeUniqueViolation(error.InnerException));

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
