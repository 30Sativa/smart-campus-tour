using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Profile;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Accounts.Commands.UpdateAccount;

/// <summary>
/// Admin edit of a managed account. Only FullName is editable: Username is the login identity,
/// and roles stay fixed after creation because role-owned data (registrations, assigned Tours)
/// is keyed to them. Admin accounts are never managed through this API.
/// </summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateAccountRequest(string FullName);

public sealed record UpdateAccountCommand(Guid Id, Guid ActorUserId, UpdateAccountRequest Request)
    : ICommand<AccountProfileResponse>, IAccountTransactionRequest;

public sealed class UpdateAccountCommandValidator : AbstractValidator<UpdateAccountCommand>
{
    public UpdateAccountCommandValidator()
    {
        RuleFor(command => command.Id).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
        RuleFor(command => command.Request).NotNull();
        When(command => command.Request is not null, () =>
            RuleFor(command => command.Request.FullName)
                .NotEmpty()
                .Must(name => name is null || name.Trim().Length > 0)
                .MaximumLength(ProfileRules.FullNameMaxLength)
                .OverridePropertyName(nameof(UpdateAccountRequest.FullName)));
    }
}

public sealed class UpdateAccountCommandHandler(
    IAccountRepository accountRepository,
    TimeProvider timeProvider)
    : IRequestHandler<UpdateAccountCommand, AccountProfileResponse>
{
    public async Task<AccountProfileResponse> Handle(UpdateAccountCommand request, CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.Id, cancellationToken)
            ?? throw new NotFoundException("Account was not found.");
        var roles = user.UserRoles.Select(userRole => userRole.Role).ToArray();
        AccountRoles.EnsureManaged(roles);

        var fullName = request.Request.FullName.Trim();
        if (fullName != user.FullName)
        {
            var now = timeProvider.GetUtcNow();
            user.FullName = fullName;
            user.UpdatedAt = now;
            accountRepository.AddAuditLog(new AuditLog
            {
                ActorUserId = request.ActorUserId,
                Action = "ACCOUNT_UPDATED",
                EntityType = "User",
                EntityId = user.Id.ToString("D"),
                OccurredAt = now
            });
        }

        return ProfileRules.ToResponse(user, ApplicationRoles.Resolve(roles));
    }
}
