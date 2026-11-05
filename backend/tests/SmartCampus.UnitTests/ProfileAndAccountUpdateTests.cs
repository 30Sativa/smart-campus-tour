using System.Text.Json;
using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Commands.UpdateAccount;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;
using SmartCampus.Application.Features.Auth;
using SmartCampus.Application.Features.Profile.Commands.ChangePassword;
using SmartCampus.Application.Features.Profile.Commands.UpdateMyProfile;
using SmartCampus.Application.Features.Profile.Queries.GetMyProfile;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class ProfileAndAccountUpdateTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 5, 8, 0, 0, TimeSpan.Zero);
    private const string OldPassword = "old-password-123";
    private const string NewPassword = "brand-new-password-456";

    private readonly Clock clock = new(Now);
    private readonly FakeAccounts accounts = new();
    private readonly FakeHasher hasher = new();

    private User AddUser(string roleCode, bool active = true)
    {
        var id = Guid.NewGuid();
        var user = new User
        {
            Id = id,
            Username = $"user.{id:N}",
            NormalizedUsername = $"USER.{id:N}",
            FullName = "Original Name",
            PasswordHash = hasher.Hash(OldPassword),
            IsActive = active,
            CreatedAt = Now.AddDays(-10),
            UserRoles = [new UserRole { UserId = id, Role = roleCode }],
            RefreshTokens =
            [
                new RefreshToken { Id = Guid.NewGuid(), UserId = id, ExpiresAt = Now.AddDays(3) },
                new RefreshToken { Id = Guid.NewGuid(), UserId = id, ExpiresAt = Now.AddDays(5) }
            ]
        };
        accounts.Users[id] = user;
        return user;
    }

    private ChangePasswordCommandHandler PasswordHandler() => new(accounts, hasher, new LoginAttemptGate(clock), clock);

    [Theory]
    [InlineData("ADMIN", "Admin")]
    [InlineData("STAFF", "Staff")]
    [InlineData("TECHNICAL_STAFF", "TechnicalStaff")]
    [InlineData("SCHOOL_REPRESENTATIVE", "Representative")]
    public async Task EveryRole_CanReadAndEditOnlyItsOwnProfile(string code, string role)
    {
        var me = AddUser(code);
        var other = AddUser("STAFF");

        var profile = await new GetMyProfileQueryHandler(accounts)
            .Handle(new GetMyProfileQuery(me.Id), CancellationToken.None);
        Assert.Equal(role, profile.Role);
        Assert.Equal(me.Id, profile.Id);

        var updated = await new UpdateMyProfileCommandHandler(accounts, clock)
            .Handle(new UpdateMyProfileCommand(me.Id, new UpdateMyProfileRequest("  New Name ")), CancellationToken.None);

        Assert.Equal("New Name", updated.FullName);
        Assert.Equal("Original Name", other.FullName);
        var audit = Assert.Single(accounts.Audits);
        Assert.Equal("PROFILE_UPDATED", audit.Action);
        Assert.Equal(me.Id, audit.ActorUserId);
    }

    [Fact]
    public async Task UpdateMyProfile_UnchangedName_WritesNoAudit()
    {
        var me = AddUser("STAFF");

        await new UpdateMyProfileCommandHandler(accounts, clock)
            .Handle(new UpdateMyProfileCommand(me.Id, new UpdateMyProfileRequest("Original Name")), CancellationToken.None);

        Assert.Empty(accounts.Audits);
    }

    [Fact]
    public async Task InactiveAccount_CannotUseSelfService()
    {
        var me = AddUser("STAFF", active: false);

        await Assert.ThrowsAsync<ForbiddenException>(() => new GetMyProfileQueryHandler(accounts)
            .Handle(new GetMyProfileQuery(me.Id), CancellationToken.None));
        await Assert.ThrowsAsync<ForbiddenException>(() => PasswordHandler().Handle(
            new ChangePasswordCommand(me.Id, new ChangePasswordRequest(OldPassword, NewPassword)), CancellationToken.None));
    }

    [Theory]
    [InlineData("""{"fullName":"x","role":"Admin"}""")]
    [InlineData("""{"fullName":"x","isActive":true}""")]
    [InlineData("""{"fullName":"x","username":"other"}""")]
    public void ProfileRequests_RejectPrivilegedOrIdentityFields(string json)
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);

        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<UpdateMyProfileRequest>(json, options));
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<UpdateAccountRequest>(json, options));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void ProfileValidators_RejectBlankName(string name)
    {
        Assert.False(new UpdateMyProfileCommandValidator()
            .Validate(new UpdateMyProfileCommand(Guid.NewGuid(), new UpdateMyProfileRequest(name))).IsValid);
        Assert.False(new UpdateAccountCommandValidator()
            .Validate(new UpdateAccountCommand(Guid.NewGuid(), Guid.NewGuid(), new UpdateAccountRequest(name))).IsValid);
    }

    [Fact]
    public void ProfileValidators_RejectOverlongName()
    {
        var name = new string('a', 151);

        Assert.False(new UpdateMyProfileCommandValidator()
            .Validate(new UpdateMyProfileCommand(Guid.NewGuid(), new UpdateMyProfileRequest(name))).IsValid);
    }

    [Fact]
    public async Task ChangePassword_CorrectCurrent_StoresNewHashRevokesAllSessionsAndAudits()
    {
        var me = AddUser("STAFF");

        await PasswordHandler().Handle(
            new ChangePasswordCommand(me.Id, new ChangePasswordRequest(OldPassword, NewPassword)), CancellationToken.None);

        Assert.False(hasher.Verify(OldPassword, me.PasswordHash));
        Assert.True(hasher.Verify(NewPassword, me.PasswordHash));
        Assert.NotEqual(NewPassword, me.PasswordHash);
        Assert.All(me.RefreshTokens, token => Assert.Equal(Now, token.RevokedAt));
        var audit = Assert.Single(accounts.Audits);
        Assert.Equal("PASSWORD_CHANGED", audit.Action);
        Assert.DoesNotContain(NewPassword, audit.Action + audit.EntityId);
    }

    [Fact]
    public async Task ChangePassword_WrongCurrent_FailsAndChangesNothing()
    {
        var me = AddUser("STAFF");
        var before = me.PasswordHash;

        var ex = await Assert.ThrowsAsync<ValidationException>(() => PasswordHandler().Handle(
            new ChangePasswordCommand(me.Id, new ChangePasswordRequest("wrong-password-xyz", NewPassword)), CancellationToken.None));

        Assert.Equal("CurrentPassword", Assert.Single(ex.Errors).PropertyName);
        Assert.Equal(before, me.PasswordHash);
        Assert.All(me.RefreshTokens, token => Assert.Null(token.RevokedAt));
        Assert.Empty(accounts.Audits);
    }

    [Fact]
    public async Task ChangePassword_SameAsCurrent_IsRejected()
    {
        var me = AddUser("STAFF");

        await Assert.ThrowsAsync<ValidationException>(() => PasswordHandler().Handle(
            new ChangePasswordCommand(me.Id, new ChangePasswordRequest(OldPassword, OldPassword)), CancellationToken.None));
    }

    [Theory]
    [InlineData("short")]
    [InlineData("            ")]
    public void ChangePassword_WeakNewPassword_FailsValidator(string weak)
    {
        var result = new ChangePasswordCommandValidator().Validate(
            new ChangePasswordCommand(Guid.NewGuid(), new ChangePasswordRequest(OldPassword, weak)));

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task ChangePassword_RepeatedWrongGuesses_AreRateLimited()
    {
        var me = AddUser("STAFF");
        var handler = PasswordHandler();
        for (var i = 0; i < LoginAttemptGate.AttemptsPerMinute; i++)
        {
            await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(
                new ChangePasswordCommand(me.Id, new ChangePasswordRequest($"guess-number-{i:D4}", NewPassword)), CancellationToken.None));
        }

        await Assert.ThrowsAsync<TooManyRequestsException>(() => handler.Handle(
            new ChangePasswordCommand(me.Id, new ChangePasswordRequest(OldPassword, NewPassword)), CancellationToken.None));
    }

    [Fact]
    public async Task AdminUpdate_ManagedAccount_ChangesNameAndAuditsActor()
    {
        var admin = AddUser("ADMIN");
        var target = AddUser("SCHOOL_REPRESENTATIVE");

        var result = await new UpdateAccountCommandHandler(accounts, clock).Handle(
            new UpdateAccountCommand(target.Id, admin.Id, new UpdateAccountRequest("Renamed By Admin")), CancellationToken.None);

        Assert.Equal("Renamed By Admin", target.FullName);
        Assert.Equal("Representative", result.Role);
        Assert.Equal(target.Username, result.Username);
        var audit = Assert.Single(accounts.Audits);
        Assert.Equal("ACCOUNT_UPDATED", audit.Action);
        Assert.Equal(admin.Id, audit.ActorUserId);
        Assert.Equal(target.Id.ToString("D"), audit.EntityId);
    }

    [Fact]
    public async Task AdminUpdate_AdminAccount_IsForbidden_IncludingTheActorItself()
    {
        var admin = AddUser("ADMIN");
        var otherAdmin = AddUser("ADMIN");
        var handler = new UpdateAccountCommandHandler(accounts, clock);

        await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(
            new UpdateAccountCommand(otherAdmin.Id, admin.Id, new UpdateAccountRequest("Hijack")), CancellationToken.None));
        await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(
            new UpdateAccountCommand(admin.Id, admin.Id, new UpdateAccountRequest("Self")), CancellationToken.None));
        Assert.Equal("Original Name", otherAdmin.FullName);
    }

    [Fact]
    public async Task AdminUpdate_UnknownAccount_IsNotFound()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => new UpdateAccountCommandHandler(accounts, clock).Handle(
            new UpdateAccountCommand(Guid.NewGuid(), Guid.NewGuid(), new UpdateAccountRequest("x")), CancellationToken.None));
    }

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    /// <summary>Deterministic stand-in: the stored value is a tagged, non-plaintext transform.</summary>
    private sealed class FakeHasher : IPasswordHasher
    {
        public string Hash(string password) => "hash:" + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(password));

        public bool Verify(string password, string storedHash) => Hash(password) == storedHash;
    }

    private sealed class FakeAccounts : IAccountRepository
    {
        public Dictionary<Guid, User> Users { get; } = [];

        public List<AuditLog> Audits { get; } = [];

        public Task<User?> FindForManagementAsync(Guid userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Users.GetValueOrDefault(userId));

        public void AddAuditLog(AuditLog auditLog) => Audits.Add(auditLog);

        public void AddAccount(User user) => Users[user.Id] = user;

        public Task<bool> NormalizedUsernameExistsAsync(string normalizedUsername, CancellationToken cancellationToken = default) =>
            Task.FromResult(false);

        public Task<PagedResult<AccountListEntry>> ListAccountsAsync(
            string? search, AccountSort sort, int page, int pageSize, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
