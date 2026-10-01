using MediatR;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;
using SmartCampus.Domain.Entities;
using SmartCampus.Domain.Exceptions;

namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount;

public sealed class CreateAccountCommandHandler(
    IAccountRepository accountRepository,
    IUsernameNormalizer usernameNormalizer,
    IPasswordHasher passwordHasher,
    TimeProvider timeProvider)
    : IRequestHandler<CreateAccountCommand, CreateAccountResponse>
{
    public async Task<CreateAccountResponse> Handle(
        CreateAccountCommand command,
        CancellationToken cancellationToken)
    {
        var username = command.Request.Username.Trim();
        var normalizedUsername = usernameNormalizer.Normalize(username);
        if (normalizedUsername.Length == 0)
            throw new DomainException("Username must not be blank.");
        var storedRole = AccountRoles.ToStoredCreatableRole(command.Request.Role);

        if (await accountRepository.NormalizedUsernameExistsAsync(
                normalizedUsername,
                cancellationToken))
        {
            throw new ConflictException("An account with this username already exists.");
        }

        var now = timeProvider.GetUtcNow();
        var userId = Guid.NewGuid();
        var user = new User
        {
            Id = userId,
            Username = username,
            NormalizedUsername = normalizedUsername,
            PasswordHash = passwordHasher.Hash(command.Request.InitialPassword),
            FullName = command.Request.FullName.Trim(),
            IsActive = true,
            CreatedAt = now,
            UserRoles =
            [
                new UserRole
                {
                    UserId = userId,
                    Role = storedRole
                }
            ]
        };

        accountRepository.AddAccount(user);
        accountRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorId,
            Action = "ACCOUNT_CREATED",
            EntityType = "User",
            EntityId = user.Id.ToString("D"),
            OccurredAt = now
        });

        return new CreateAccountResponse(
            user.Id,
            user.Username,
            user.FullName,
            ApplicationRoles.Resolve([storedRole]),
            user.IsActive,
            user.CreatedAt,
            user.UpdatedAt);
    }
}
