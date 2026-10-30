using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;
using SmartCampus.Application.Features.Auth.Commands.Login;
using SmartCampus.Application.Features.Auth.Queries.Refresh;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;

namespace SmartCampus.IntegrationTests;

public sealed class AccountConcurrencyTests
{
    [SchemaV11Fact]
    public async Task LoginSnapshotBeforeDeactivate_CannotPersistARefreshTokenAfterIt()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var user = await database.InsertUserAsync(true, username: "race.staff", roles: ["STAFF"]);
        var read = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var resume = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var provider = Provider(database.ConnectionString, services => services.AddScoped<IAuthRepository>(s =>
            new PausedAuth(new EfAuthRepository(s.GetRequiredService<ApplicationDbContext>()), read, resume)));
        await using var loginScope = provider.CreateAsyncScope();
        var login = loginScope.ServiceProvider.GetRequiredService<ISender>().Send(new LoginCommand("race.staff", InitialAdminSeederTests.Password));
        try
        {
            await Task.WhenAny(read.Task, login).WaitAsync(TimeSpan.FromSeconds(10));
            if (login.IsCompleted) await login;
            await read.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await Send(provider, new DeactivateAccountCommand(user.Id, user.Id));
        }
        finally { resume.TrySetResult(); }
        await Assert.ThrowsAsync<ForbiddenException>(() => login);
        await Send(provider, new ReactivateAccountCommand(user.Id, user.Id));
        Assert.Equal(0, await database.CountRowsAsync("dbo.RefreshTokens"));
    }

    [SchemaV11Fact]
    public async Task CommittedLoginIsRevokedByDeactivate_AndDoesNotReviveAfterReactivate()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var user = await database.InsertUserAsync(true, username: "race.staff", roles: ["STAFF"]);
        await using var provider = Provider(database.ConnectionString);
        var session = await Send(provider, new LoginCommand("race.staff", InitialAdminSeederTests.Password));
        await Send(provider, new DeactivateAccountCommand(user.Id, user.Id));
        await Send(provider, new ReactivateAccountCommand(user.Id, user.Id));
        await Assert.ThrowsAsync<UnauthorizedException>(() => Send(provider, new RefreshSessionQuery(session.RefreshToken)));
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);
        Assert.NotNull((await db.RefreshTokens.SingleAsync()).RevokedAt);
    }

    [SchemaV11Fact]
    public async Task ConcurrentAccountCreation_WithSameUsername_HasOneSuccessAndOneConflict()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var admin = await database.InsertUserAsync(true, username: "test.admin", roles: ["ADMIN"]);
        await using var provider = Provider(database.ConnectionString);
        var request = new CreateAccountCommand(admin.Id, new CreateAccountRequest("same.staff", "Synthetic", "Staff", "a long test password"));
        async Task<bool> Create()
        {
            try { await Send(provider, request); return true; }
            catch (ConflictException) { return false; }
        }
        var outcomes = await Task.WhenAll(Create(), Create());
        Assert.Single(outcomes, success => success);
        Assert.Single(outcomes, success => !success);
        Assert.Equal(2, await database.CountRowsAsync("dbo.Users"));
        Assert.Equal(1, await database.CountRowsAsync("dbo.AuditLogs"));
    }

    internal static ServiceProvider Provider(string connection, Action<IServiceCollection>? configure = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connection,
            ["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey,
            ["Tours:StartSlots:0"] = "09:00"
        }).Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddInfrastructure(configuration);
        configure?.Invoke(services);
        return services.BuildServiceProvider();
    }

    private static async Task<T> Send<T>(ServiceProvider provider, IRequest<T> request)
    {
        await using var scope = provider.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
    }

    private sealed class PausedAuth(IAuthRepository inner, TaskCompletionSource read, TaskCompletionSource resume) : IAuthRepository
    {
        public async Task<User?> FindUserByNormalizedUsernameAsync(string username, CancellationToken ct = default)
        {
            var user = await inner.FindUserByNormalizedUsernameAsync(username, ct);
            read.TrySetResult();
            await resume.Task.WaitAsync(ct);
            return user;
        }
        public Task<User?> LockUserAsync(Guid id, CancellationToken ct = default) => inner.LockUserAsync(id, ct);
        public Task<RefreshToken?> FindRefreshTokenByHashAsync(byte[] hash, CancellationToken ct = default) => inner.FindRefreshTokenByHashAsync(hash, ct);
        public void AddRefreshToken(RefreshToken token) => inner.AddRefreshToken(token);
    }
}
