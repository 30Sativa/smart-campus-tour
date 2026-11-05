using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Profile.Queries.GetMyProfile;

/// <summary>The subject always comes from the authenticated token, never from the request.</summary>
public sealed record GetMyProfileQuery(Guid UserId) : IQuery<AccountProfileResponse>, IAccountTransactionRequest;

public sealed class GetMyProfileQueryHandler(IAccountRepository accountRepository)
    : IRequestHandler<GetMyProfileQuery, AccountProfileResponse>
{
    public async Task<AccountProfileResponse> Handle(GetMyProfileQuery request, CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.UserId, cancellationToken)
            ?? throw new UnauthorizedException("A valid account identity is required.");
        return ProfileRules.ToResponse(user, ProfileRules.EnsureUsable(user));
    }
}
