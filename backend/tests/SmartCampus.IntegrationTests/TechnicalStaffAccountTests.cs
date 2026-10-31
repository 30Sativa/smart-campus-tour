using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Configuration;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;
using SmartCampus.Application.Features.Auth.Commands.Login;
using SmartCampus.Application.Features.Auth;
using SmartCampus.Application.Features.Auth.Queries.Refresh;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;

namespace SmartCampus.IntegrationTests;

// Handler/JWT/policy checks run without SQL. Persistence and transaction behavior
// are tested separately by TechnicalStaffSqlTests using a disposable database.
public sealed class TechnicalStaffAccountTests
{
    private const string Password = "technical-account-test-password";

    [Theory]
    [InlineData("ADMIN", "Admin")]
    [InlineData("STAFF", "Staff")]
    [InlineData("SCHOOL_REPRESENTATIVE", "Representative")]
    [InlineData("TECHNICAL_STAFF", "TechnicalStaff")]
    public async Task LoginAndRefresh_ReturnOneConsistentRoleAndSignedClaim(string storedRole, string role)
    {
        var repository = new Accounts();
        repository.Seed(true, [storedRole]);
        var tokens = TokenService();
        var login = await Login(repository, tokens).Handle(new("test.user", Password), default);
        Assert.Equal(role, login.Role);
        AssertClaim(login.AccessToken, role);
        var refreshed = await new RefreshSessionQueryHandler(repository, tokens, TimeProvider.System)
            .Handle(new(login.RefreshToken), default);
        Assert.Equal(role, refreshed.Role);
        Assert.Equal(login.RefreshToken, refreshed.RefreshToken);
        AssertClaim(refreshed.AccessToken, role);
    }

    [Theory]
    [InlineData(false, "TECHNICAL_STAFF")]
    [InlineData(true, "")]
    [InlineData(true, "UNKNOWN")]
    [InlineData(true, "VIEWER")]
    [InlineData(true, "TECHNICAL_STAFF,STAFF")]
    [InlineData(true, "TECHNICAL_STAFF,ADMIN")]
    [InlineData(true, "TECHNICAL_STAFF,SCHOOL_REPRESENTATIVE")]
    [InlineData(true, "TECHNICAL_STAFF,UNKNOWN")]
    public async Task LoginAndRefresh_RejectLockedOrInvalidRoleAssignments(bool active, string codes)
    {
        var repository = new Accounts();
        repository.Seed(active, codes.Length == 0 ? [] : codes.Split(','));
        var tokens = TokenService();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            Login(repository, tokens).Handle(new("test.user", Password), default));
        Assert.Empty(repository.User!.RefreshTokens);

        // Existing refresh token must recheck the current account/role snapshot.
        const string rawToken = "test-existing-refresh";
        repository.AddRefreshToken(new RefreshToken
        {
            Id = Guid.NewGuid(), UserId = repository.User.Id,
            TokenHash = tokens.HashRefreshToken(rawToken),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1)
        });
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new RefreshSessionQueryHandler(repository, tokens, TimeProvider.System)
                .Handle(new(rawToken), default));
    }

    [Fact]
    public async Task AccountHandlers_CreateListDeactivateAndReactivateTechnicalStaff()
    {
        var repository = new Accounts();
        var actor = Guid.NewGuid();
        var request = new CreateAccountCommand(actor,
            new CreateAccountRequest("test.user", "Technical User", "TechnicalStaff", Password));
        Assert.True(new CreateAccountCommandValidator().Validate(request).IsValid);
        var created = await new CreateAccountCommandHandler(repository, new InvariantUsernameNormalizer(),
            new IdentityPasswordHasher(), TimeProvider.System).Handle(request, default);
        Assert.Equal("TechnicalStaff", created.Role);
        Assert.Equal("TECHNICAL_STAFF", Assert.Single(repository.User!.UserRoles).Role);
        Assert.NotEqual(Password, repository.User.PasswordHash);
        var list = await new GetAccountsQueryHandler(repository).Handle(new(new(null, null)), default);
        Assert.Equal("TechnicalStaff", Assert.Single(list.Items).Role);
        var tokens = TokenService();
        var login = await Login(repository, tokens).Handle(new("test.user", Password), default);

        await new DeactivateAccountCommandHandler(repository, TimeProvider.System)
            .Handle(new(created.Id, actor), default);
        Assert.False(repository.User.IsActive);
        Assert.NotNull(Assert.Single(repository.User.RefreshTokens).RevokedAt);
        await Assert.ThrowsAsync<ForbiddenException>(() => Login(repository, tokens).Handle(new("test.user", Password), default));
        await Assert.ThrowsAsync<UnauthorizedException>(() => new RefreshSessionQueryHandler(repository, tokens, TimeProvider.System)
            .Handle(new(login.RefreshToken), default));
        await new ReactivateAccountCommandHandler(repository, TimeProvider.System).Handle(new(created.Id, actor), default);
        Assert.True(repository.User.IsActive);
        Assert.NotNull(repository.User.RefreshTokens.First().RevokedAt);
        Assert.Equal("TechnicalStaff", (await Login(repository, tokens).Handle(new("test.user", Password), default)).Role);
        Assert.Equal(new[] { "ACCOUNT_CREATED", "ACCOUNT_DEACTIVATED", "ACCOUNT_REACTIVATED" },
            repository.Audit.Select(x => x.Action));
    }

    [Fact]
    public async Task TechnicalStaff_IsDeniedEveryExistingBusinessRoleBoundary_WithoutSql()
    {
        const string unusedDatabase = "Server=127.0.0.1,1;Database=Unused;User ID=unused;Password=unused;TrustServerCertificate=true;Connect Timeout=1";
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(unusedDatabase);
        var token = TokenService().IssueAccessToken(Guid.NewGuid(), ApplicationRoles.TechnicalStaff, DateTimeOffset.UtcNow);
        var id = Guid.NewGuid();
        var targets = new (HttpMethod Method, string Path)[]
        {
            (HttpMethod.Get, "/api/admin/accounts"),
            (HttpMethod.Post, "/api/admin/accounts"),
            (HttpMethod.Post, $"/api/admin/accounts/{id}/deactivate"),
            (HttpMethod.Post, $"/api/admin/accounts/{id}/reactivate"),
            (HttpMethod.Get, "/api/staff/manage/routes"),
            (HttpMethod.Post, "/api/staff/routes"),
            (HttpMethod.Get, "/api/staff/manage/tours"),
            (HttpMethod.Get, "/api/staff/manage/registrations"),
            (HttpMethod.Get, "/api/representative/tours"),
            (HttpMethod.Get, "/api/representative/registrations"),
            (HttpMethod.Get, $"/api/registrations/{id}/invitations"),
            (HttpMethod.Post, "/hubs/operations/negotiate?negotiateVersion=1")
        };
        foreach (var (method, path) in targets)
        {
            using var request = new HttpRequestMessage(method, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await host.Client.SendAsync(request);
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden,
                $"{method} {path}: expected 403 before SQL, got {response.StatusCode}");
        }
    }

    private static LoginCommandHandler Login(Accounts repository, IAuthTokenService tokens) =>
        new(repository, new IdentityPasswordHasher(), new InvariantUsernameNormalizer(), tokens,
            TimeProvider.System, new LoginAttemptGate(TimeProvider.System));

    internal static JwtAuthTokenService TokenService() => new(Settings());
    private static JwtTokenSettings Settings() => new(new ConfigurationBuilder().AddInMemoryCollection(
        new Dictionary<string, string?> { ["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey }).Build());

    internal static void AssertClaim(string token, string role)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var principal = handler.ValidateToken(token, Settings().CreateValidationParameters(), out _);
        Assert.Equal(role, Assert.Single(principal.FindAll("role")).Value);
        Assert.False(principal.IsInRole("Admin") && role != "Admin");
        Assert.False(principal.IsInRole("Staff") && role != "Staff");
        Assert.False(principal.IsInRole("Representative") && role != "Representative");
    }

    private sealed class Accounts : IAuthRepository, IAccountRepository
    {
        public User? User { get; private set; }
        public List<AuditLog> Audit { get; } = [];
        public void Seed(bool active, string[] codes)
        {
            User = new User { Id = Guid.NewGuid(), Username = "test.user", NormalizedUsername = "TEST.USER",
                FullName = "Test User", IsActive = active, PasswordHash = new IdentityPasswordHasher().Hash(Password) };
            foreach (var code in codes) User.UserRoles.Add(new UserRole { UserId = User.Id, Role = code });
        }
        public Task<User?> FindUserByNormalizedUsernameAsync(string username, CancellationToken cancellationToken = default) =>
            Task.FromResult(User?.NormalizedUsername == username ? User : null);
        public Task<User?> LockUserAsync(Guid id, CancellationToken cancellationToken = default) =>
            Task.FromResult(User?.Id == id ? User : null);
        public Task<User?> FindForManagementAsync(Guid id, CancellationToken cancellationToken = default) => LockUserAsync(id, cancellationToken);
        public Task<RefreshToken?> FindRefreshTokenByHashAsync(byte[] hash, CancellationToken cancellationToken = default) =>
            Task.FromResult(User?.RefreshTokens.SingleOrDefault(t => t.TokenHash.SequenceEqual(hash)));
        public void AddRefreshToken(RefreshToken token) { token.User = User!; User!.RefreshTokens.Add(token); }
        public Task<bool> NormalizedUsernameExistsAsync(string username, CancellationToken cancellationToken = default) =>
            Task.FromResult(User?.NormalizedUsername == username);
        public void AddAccount(User user) => User = user;
        public void AddAuditLog(AuditLog audit) => Audit.Add(audit);
        public Task<PagedResult<AccountListEntry>> ListAccountsAsync(string? search, AccountSort sort, int page, int pageSize,
            CancellationToken cancellationToken = default)
        {
            var u = User!;
            return Task.FromResult(new PagedResult<AccountListEntry>([new(u.Id, u.Username, u.FullName,
                u.UserRoles.FirstOrDefault()?.Role, u.UserRoles.Count, u.IsActive, u.CreatedAt, u.UpdatedAt)], 1, 20, 1));
        }
    }
}
