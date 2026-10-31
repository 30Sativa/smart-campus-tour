using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Auth;
using SmartCampus.Application.Features.Auth.Commands.Login;
using SmartCampus.Application.Features.Auth.Commands.Logout;
using SmartCampus.Application.Features.Auth.Queries.Refresh;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(ISender sender, IConfiguration configuration) : ControllerBase
{
    private const string RefreshCookieName = "campustour.refresh";

    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("AccountLogin")]
    public async Task<ActionResult<AuthResponse>> Login(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        CookieRequestOrigin.EnsureAllowed(Request, configuration);
        var session = await sender.Send(
            new LoginCommand(request.Username, request.Password),
            cancellationToken);

        SetRefreshCookie(session.RefreshToken, session.RefreshTokenExpiresAt);
        return Ok(ToResponse(session));
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(CancellationToken cancellationToken)
    {
        CookieRequestOrigin.EnsureAllowed(Request, configuration);
        try
        {
            var session = await sender.Send(
                new RefreshSessionQuery(Request.Cookies[RefreshCookieName]),
                cancellationToken);

            SetRefreshCookie(session.RefreshToken, session.RefreshTokenExpiresAt);
            return Ok(ToResponse(session));
        }
        catch (UnauthorizedException)
        {
            ClearRefreshCookie();
            throw;
        }
        catch (ForbiddenException)
        {
            ClearRefreshCookie();
            throw;
        }
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        CookieRequestOrigin.EnsureAllowed(Request, configuration);
        try
        {
            await sender.Send(
                new LogoutCommand(Request.Cookies[RefreshCookieName]),
                cancellationToken);
        }
        finally
        {
            ClearRefreshCookie();
        }

        return NoContent();
    }

    private void SetRefreshCookie(string refreshToken, DateTimeOffset expiresAt)
    {
        Response.Cookies.Append(
            RefreshCookieName,
            refreshToken,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.None,
                Path = "/api/auth",
                Expires = expiresAt,
                IsEssential = true
            });
    }

    private void ClearRefreshCookie() =>
        Response.OnStarting(static state =>
        {
            var response = (HttpResponse)state;
            response.Cookies.Delete(
                RefreshCookieName,
                new CookieOptions
                {
                    HttpOnly = true,
                    Secure = true,
                    SameSite = SameSiteMode.None,
                    Path = "/api/auth",
                    IsEssential = true
                });
            return Task.CompletedTask;
        }, Response);

    private static AuthResponse ToResponse(AuthSessionResult session) =>
        new(session.AccessToken, session.UserId, session.Username, session.Role);
}

public sealed record LoginRequest(string Username, string Password);

public sealed record AuthResponse(string AccessToken, Guid UserId, string Username, string Role);
