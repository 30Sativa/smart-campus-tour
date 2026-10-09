using System.Net;
using System.Text.Json;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCampus.Api.ExceptionHandling;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Exceptions;

namespace SmartCampus.IntegrationTests;

public sealed class GlobalExceptionHandlerTests
{
    [Theory]
    [MemberData(nameof(ExpectedErrorMappings))]
    public async Task TryHandleAsync_MapsKnownExceptions(
        Exception exception,
        HttpStatusCode expectedStatusCode)
    {
        var context = CreateHttpContext();
        var handler = new GlobalExceptionHandler(
            NullLogger<GlobalExceptionHandler>.Instance);

        var handled = await handler.TryHandleAsync(
            context,
            exception,
            CancellationToken.None);

        Assert.True(handled);
        Assert.Equal((int)expectedStatusCode, context.Response.StatusCode);

        using var response = await ReadResponseAsync(context);
        Assert.False(response.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task TryHandleAsync_ValidationException_ReturnsErrorsByField()
    {
        var context = CreateHttpContext();
        var exception = new ValidationException(
        [
            new ValidationFailure("Page", "Page must be at least 1."),
            new ValidationFailure("Size", "Size must be at most 100.")
        ]);
        var handler = new GlobalExceptionHandler(
            NullLogger<GlobalExceptionHandler>.Instance);

        await handler.TryHandleAsync(
            context,
            exception,
            CancellationToken.None);

        using var response = await ReadResponseAsync(context);
        var errors = response.RootElement.GetProperty("errors");

        Assert.Equal(
            "Page must be at least 1.",
            errors.GetProperty("Page")[0].GetString());
        Assert.Equal(
            "Size must be at most 100.",
            errors.GetProperty("Size")[0].GetString());
    }

    [Fact]
    public async Task TryHandleAsync_RepresentativeConflict_ReturnsCodeAndFields()
    {
        var context = CreateHttpContext();
        var handler = new GlobalExceptionHandler(NullLogger<GlobalExceptionHandler>.Instance);
        var fields = new Dictionary<string, string[]> { ["Roster[0].Email"] = ["Email đã được đăng ký trong Tour này."] };

        await handler.TryHandleAsync(context,
            new ConflictException("Có email đã được đăng ký trong Tour này.", "EMAIL_RESERVED", fields),
            CancellationToken.None);

        using var response = await ReadResponseAsync(context);
        var errors = response.RootElement.GetProperty("errors");
        Assert.Equal("EMAIL_RESERVED", errors.GetProperty("code").GetString());
        Assert.Equal("Email đã được đăng ký trong Tour này.",
            errors.GetProperty("fields").GetProperty("Roster[0].Email")[0].GetString());
    }

    [Fact]
    public async Task TryHandleAsync_GenericConflict_PreservesNullErrors()
    {
        var context = CreateHttpContext();
        var handler = new GlobalExceptionHandler(NullLogger<GlobalExceptionHandler>.Instance);

        await handler.TryHandleAsync(context, new ConflictException("Robot is already assigned."), CancellationToken.None);

        using var response = await ReadResponseAsync(context);
        Assert.Equal(JsonValueKind.Null, response.RootElement.GetProperty("errors").ValueKind);
    }

    [Fact]
    public async Task TryHandleAsync_UnexpectedException_DoesNotExposeDetails()
    {
        var context = CreateHttpContext();
        var handler = new GlobalExceptionHandler(
            NullLogger<GlobalExceptionHandler>.Instance);

        await handler.TryHandleAsync(
            context,
            new InvalidOperationException("Sensitive database detail."),
            CancellationToken.None);

        using var response = await ReadResponseAsync(context);
        var json = response.RootElement.GetRawText();

        Assert.Equal(
            "An unexpected error occurred.",
            response.RootElement.GetProperty("message").GetString());
        Assert.DoesNotContain("Sensitive database detail.", json);
    }

    public static TheoryData<Exception, HttpStatusCode> ExpectedErrorMappings => new()
    {
        { new ValidationException([]), HttpStatusCode.BadRequest },
        { new DomainException("Domain rule failed."), HttpStatusCode.BadRequest },
        { new UnauthorizedException("A valid account identity is required."), HttpStatusCode.Unauthorized },
        { new NotFoundException("Robot was not found."), HttpStatusCode.NotFound },
        { new ConflictException("Robot is already assigned."), HttpStatusCode.Conflict },
        { new Exception("Unexpected."), HttpStatusCode.InternalServerError }
    };

    private static DefaultHttpContext CreateHttpContext()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        return context;
    }

    private static async Task<JsonDocument> ReadResponseAsync(HttpContext context)
    {
        context.Response.Body.Position = 0;
        return await JsonDocument.ParseAsync(
            context.Response.Body,
            cancellationToken: CancellationToken.None);
    }
}
