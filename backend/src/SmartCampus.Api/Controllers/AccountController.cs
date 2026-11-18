using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Profile;
using SmartCampus.Application.Features.Profile.Commands.ChangePassword;
using SmartCampus.Application.Features.Profile.Commands.SetMyAvatar;
using SmartCampus.Application.Features.Profile.Commands.UpdateMyProfile;
using SmartCampus.Application.Features.Profile.Queries.GetMyProfile;
using SmartCampus.Application.Features.Profile.Queries.GetAvatarUpload;

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

    /// <summary>ADR-0064: signs one direct upload of a new avatar picture to Cloudinary.</summary>
    [HttpPost("avatar-upload")]
    public async Task<ActionResult<BaseResponse<AvatarUploadTicket>>> SignAvatarUpload(CancellationToken cancellationToken) =>
        Ok(new BaseResponse<AvatarUploadTicket>
        {
            Success = true,
            Message = "Avatar upload signed.",
            Data = await sender.Send(new GetAvatarUploadQuery(User.GetRequiredUserId()), cancellationToken)
        });

    /// <summary>ADR-0064: sets the avatar to this account's own upload, or removes it with <c>null</c>.</summary>
    [HttpPut("avatar")]
    public async Task<ActionResult<BaseResponse<AccountProfileResponse>>> SetAvatar(
        [FromBody] SetMyAvatarRequest request,
        CancellationToken cancellationToken) =>
        Ok(new BaseResponse<AccountProfileResponse>
        {
            Success = true,
            Message = "Avatar updated.",
            Data = await sender.Send(new SetMyAvatarCommand(User.GetRequiredUserId(), request), cancellationToken)
        });

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
