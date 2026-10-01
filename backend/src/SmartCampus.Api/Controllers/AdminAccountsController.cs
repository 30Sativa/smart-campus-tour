using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Features.Accounts.Requests;
using SmartCampus.Api.Features.Accounts.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/accounts")]
public sealed class AdminAccountsController(
    ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<AccountListItemResponse>>> List(
        [FromQuery] CollectionQueryParameters request,
        CancellationToken cancellationToken = default)
    {
        var result = await sender.Send(
            new GetAccountsQuery(
                request.Search,
                request.Sort,
                request.Page,
                request.Size,
                request.Expand),
            cancellationToken);
        return Ok(new PagedResponse<AccountListItemResponse>
        {
            Success = true,
            Message = "Accounts retrieved.",
            Data = result.Items.Select(account => new AccountListItemResponse(
                account.Id,
                account.Username,
                account.FullName,
                account.Role,
                account.IsActive,
                account.CreatedAt,
                account.UpdatedAt)).ToArray(),
            Pagination = new PaginationMetadata(
                result.Page,
                result.PageSize,
                result.TotalItems,
                result.TotalPages)
        });
    }

    [HttpPost]
    public async Task<ActionResult<BaseResponse<CreateAccountResponse>>> Create(
        [FromBody] CreateAccountRequest request,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(
            new CreateAccountCommand(
                request.Username,
                request.FullName,
                request.Role,
                request.InitialPassword,
                GetActorUserId()),
            cancellationToken);

        return Ok(new BaseResponse<CreateAccountResponse>
        {
            Success = true,
            Message = "Account created.",
            Data = new CreateAccountResponse(
                result.Id,
                result.Username,
                result.FullName,
                result.Role,
                result.IsActive,
                result.CreatedAt,
                result.UpdatedAt)
        });
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(
        Guid id,
        CancellationToken cancellationToken)
    {
        await sender.Send(new DeactivateAccountCommand(id, GetActorUserId()), cancellationToken);
        return Ok(new BaseResponse<object?>
        {
            Success = true,
            Message = "Account deactivated.",
            Data = null
        });
    }

    [HttpPost("{id:guid}/reactivate")]
    public async Task<IActionResult> Reactivate(
        Guid id,
        CancellationToken cancellationToken)
    {
        await sender.Send(new ReactivateAccountCommand(id, GetActorUserId()), cancellationToken);
        return Ok(new BaseResponse<object?>
        {
            Success = true,
            Message = "Account reactivated.",
            Data = null
        });
    }

    private Guid GetActorUserId()
    {
        var subject = User.FindFirstValue("sub");
        if (!Guid.TryParse(subject, out var actorUserId))
            throw new UnauthorizedException("A valid account identity is required.");
        return actorUserId;
    }
}
