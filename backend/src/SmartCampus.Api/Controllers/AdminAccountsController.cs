using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/accounts")]
public sealed class AdminAccountsController(
    ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<AccountListItemResponse>>> List(
        [FromQuery] CollectionQueryParameters parameters,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(parameters.Expand))
        {
            throw new ValidationException(
            [
                new ValidationFailure(nameof(parameters.Expand), "Account expansion is not supported.")
            ]);
        }

        var request = new GetAccountsRequest(
            parameters.Search,
            parameters.Sort,
            parameters.Page,
            parameters.Size);
        var result = await sender.Send(
            new GetAccountsQuery(request),
            cancellationToken);
        return Ok(new PagedResponse<AccountListItemResponse>
        {
            Success = true,
            Message = "Accounts retrieved.",
            Data = result.Items,
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
        var response = await sender.Send(
            new CreateAccountCommand(User.GetRequiredUserId(), request),
            cancellationToken);

        return Ok(new BaseResponse<CreateAccountResponse>
        {
            Success = true,
            Message = "Account created.",
            Data = response
        });
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(
        Guid id,
        CancellationToken cancellationToken)
    {
        await sender.Send(new DeactivateAccountCommand(id, User.GetRequiredUserId()), cancellationToken);
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
        await sender.Send(new ReactivateAccountCommand(id, User.GetRequiredUserId()), cancellationToken);
        return Ok(new BaseResponse<object?>
        {
            Success = true,
            Message = "Account reactivated.",
            Data = null
        });
    }
}
