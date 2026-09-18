using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Behaviors;

namespace SmartCampus.UnitTests;

public sealed class UnitOfWorkBehaviorTests
{
    [Fact]
    public async Task Handle_Command_CommitsAfterHandlerSucceeds()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<TestCommand, string>(serviceProvider);

        var response = await behavior.Handle(
            new TestCommand(),
            _ => Task.FromResult("handled"),
            CancellationToken.None);

        Assert.Equal("handled", response);
        Assert.Equal(1, dbContext.SaveChangesCalls);
        Assert.Equal(1, serviceProvider.DbContextResolutionCount);
    }

    [Fact]
    public async Task Handle_Query_DoesNotResolvePersistenceOrCommit()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<TestQuery, string>(serviceProvider);

        var response = await behavior.Handle(
            new TestQuery(),
            _ => Task.FromResult("handled"),
            CancellationToken.None);

        Assert.Equal("handled", response);
        Assert.Equal(0, dbContext.SaveChangesCalls);
        Assert.Equal(0, serviceProvider.DbContextResolutionCount);
    }

    [Fact]
    public async Task Handle_FailedCommand_DoesNotCommit()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<TestCommand, string>(serviceProvider);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            behavior.Handle(
                new TestCommand(),
                _ => throw new InvalidOperationException("Handler failed."),
                CancellationToken.None));

        Assert.Equal(0, dbContext.SaveChangesCalls);
        Assert.Equal(0, serviceProvider.DbContextResolutionCount);
    }

    private sealed record TestCommand : ICommand<string>;

    private sealed record TestQuery : IQuery<string>;

    private sealed class RecordingDbContext : IApplicationDbContext
    {
        public int SaveChangesCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveChangesCalls++;
            return Task.FromResult(1);
        }
    }

    private sealed class RecordingServiceProvider(
        IApplicationDbContext dbContext) : IServiceProvider
    {
        public int DbContextResolutionCount { get; private set; }

        public object? GetService(Type serviceType)
        {
            if (serviceType != typeof(IApplicationDbContext))
            {
                return null;
            }

            DbContextResolutionCount++;
            return dbContext;
        }
    }
}
