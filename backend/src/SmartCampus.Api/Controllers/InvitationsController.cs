using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Invitations.Commands.ManageInvitation;
using SmartCampus.Application.Features.Invitations.Queries.GetInvitations;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin + "," + ApplicationRoles.Representative)]
[Route("api/registrations/{registrationId:guid}/invitations")]
public sealed class InvitationsController(ISender sender) : ControllerBase
{
    private Guid? Owner => User.IsInRole(ApplicationRoles.Admin) ? null : User.GetRequiredUserId();
    [HttpGet]
    public async Task<ActionResult<BaseResponse<InvitationDetails>>> Get(Guid registrationId, CancellationToken ct) =>
        Ok(new BaseResponse<InvitationDetails> { Success = true, Message = "OK",
            Data = await sender.Send(new GetInvitationsQuery(registrationId, Owner), ct) });
    [HttpPost("issue")]
    public Task<ActionResult<BaseResponse<object?>>> Issue(Guid registrationId, InvitationRequest request, CancellationToken ct) =>
        Mutate(registrationId, null, "issue", request, ct);
    [HttpPost("{invitationId:guid}/resend")]
    public Task<ActionResult<BaseResponse<object?>>> Resend(Guid registrationId, Guid invitationId, InvitationRequest request, CancellationToken ct) =>
        Mutate(registrationId, invitationId, "resend", request, ct);
    [HttpPost("{invitationId:guid}/reissue")]
    public Task<ActionResult<BaseResponse<object?>>> Reissue(Guid registrationId, Guid invitationId, InvitationRequest request, CancellationToken ct) =>
        Mutate(registrationId, invitationId, "reissue", request, ct);
    [HttpPost("{invitationId:guid}/revoke")]
    public Task<ActionResult<BaseResponse<object?>>> Revoke(Guid registrationId, Guid invitationId, InvitationRequest request, CancellationToken ct) =>
        Mutate(registrationId, invitationId, "revoke", request, ct);
    private async Task<ActionResult<BaseResponse<object?>>> Mutate(Guid registrationId, Guid? invitationId,
        string operation, InvitationRequest request, CancellationToken ct)
    {
        await sender.Send(new ManageInvitationCommand(registrationId, invitationId, User.GetRequiredUserId(), Owner, operation, request), ct);
        return Ok(new BaseResponse<object?> { Success = true, Message = "OK", Data = null });
    }
}
