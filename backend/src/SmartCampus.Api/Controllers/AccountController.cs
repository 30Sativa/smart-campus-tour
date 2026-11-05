using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Profile;
using SmartCampus.Application.Features.Profile.Commands.ChangePassword;
using SmartCampus.Application.Features.Profile.Commands.UpdateMyProfile;
using SmartCampus.Application.Features.Profile.Queries.GetMyProfile;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// Self-service profile for every account role. There is deliberately no {id} parameter:
/// the subject is always the authenticated token's own account, so another user's profile
/// cannot be addressed.
/// </summary>
[ApiController]
[Authorize(Roles = $"{ApplicationRoles.Admin},{ApplicationRoles.Staff},{ApplicationRoles.TechnicalStaff},{ApplicationRoles.Representative}")]
[Route("api/account/me")]
public sealed class AccountController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<BaseResponse<AccountProfileResponse>>> Get(CancellationToken cancellationToken)
    {
        var profile = await sender.Send(new GetMyProfileQuery(User.GetRequiredUserId()), cancellationToken);
        return Ok(new BaseResponse<AccountProfileResponse>
        {
            Success = true,
            Message = "Profile retrieved.",
            Data = profile
        });
    }

    [HttpPut]
    public async Task<ActionResult<BaseResponse<AccountProfileResponse>>> Update(
        [FromBody] UpdateMyProfileRequest request,
        CancellationToken cancellationToken)
    {
        var profile = await sender.Send(
            new UpdateMyProfileCommand(User.GetRequiredUserId(), request),
            cancellationToken);
        return Ok(new BaseResponse<AccountProfileResponse>
        {
            Success = true,
            Message = "Profile updated.",
            Data = profile
        });
    }

    /// <summary>Revokes every refresh token of the account; the client must sign in again.</summary>
    [HttpPost("password")]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        await sender.Send(new ChangePasswordCommand(User.GetRequiredUserId(), request), cancellationToken);
        return Ok(new BaseResponse<object?>
        {
            Success = true,
            Message = "Password changed. Sign in again.",
            Data = null
        });
    }
}
