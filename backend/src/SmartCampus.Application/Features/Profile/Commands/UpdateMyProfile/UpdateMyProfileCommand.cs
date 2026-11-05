using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Profile.Commands.UpdateMyProfile;

/// <summary>Only the full name is self-editable. Username (login identity), role and status are not.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateMyProfileRequest(string FullName);

public sealed record UpdateMyProfileCommand(Guid UserId, UpdateMyProfileRequest Request)
    : ICommand<AccountProfileResponse>, IAccountTransactionRequest;

public sealed class UpdateMyProfileCommandValidator : AbstractValidator<UpdateMyProfileCommand>
{
    public UpdateMyProfileCommandValidator()
    {
        RuleFor(command => command.UserId).NotEmpty();
        RuleFor(command => command.Request).NotNull();
        When(command => command.Request is not null, () =>
            RuleFor(command => command.Request.FullName)
                .NotEmpty()
                .Must(name => name is null || name.Trim().Length > 0)
                .MaximumLength(ProfileRules.FullNameMaxLength)
                .OverridePropertyName(nameof(UpdateMyProfileRequest.FullName)));
    }
}

public sealed class UpdateMyProfileCommandHandler(
    IAccountRepository accountRepository,
    TimeProvider timeProvider)
    : IRequestHandler<UpdateMyProfileCommand, AccountProfileResponse>
{
    public async Task<AccountProfileResponse> Handle(UpdateMyProfileCommand request, CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.UserId, cancellationToken)
            ?? throw new UnauthorizedException("A valid account identity is required.");
        var role = ProfileRules.EnsureUsable(user);

        var fullName = request.Request.FullName.Trim();
        if (fullName != user.FullName)
        {
            var now = timeProvider.GetUtcNow();
            user.FullName = fullName;
            user.UpdatedAt = now;
            accountRepository.AddAuditLog(new AuditLog
            {
                ActorUserId = user.Id,
                Action = "PROFILE_UPDATED",
                EntityType = "User",
                EntityId = user.Id.ToString("D"),
                OccurredAt = now
            });
        }

        return ProfileRules.ToResponse(user, role);
    }
}
