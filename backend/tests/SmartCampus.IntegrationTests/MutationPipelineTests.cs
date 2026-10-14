using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class MutationPipelineTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SuccessfulMutation_SavesBeforeCommit(bool poi)
    {
        var state = new RecordingState();
        await using var provider = CreateProvider(state);
        var result = await SendAsync(provider, poi);

        Assert.Equal("saved", result);
        Assert.Equal(["begin", "handler", "save", "commit", "dispose"], state.Events);
    }

    [Theory]
    [InlineData(false, "handler")]
    [InlineData(true, "handler")]
    [InlineData(false, "save")]
    [InlineData(true, "save")]
    [InlineData(false, "commit")]
    [InlineData(true, "commit")]
    public async Task FailedMutation_DisposesAndDoesNotPublishSuccess(bool poi, string failure)
    {
        var state = new RecordingState { Failure = failure };
        await using var provider = CreateProvider(state);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => SendAsync(provider, poi));

        Assert.Equal(failure, error.Message);
        var expected = failure switch
        {
            "handler" => new[] { "begin", "handler", "dispose" },
            "save" => ["begin", "handler", "save", "dispose"],
            _ => ["begin", "handler", "save", "commit", "dispose"]
        };
        Assert.Equal(expected, state.Events);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InvalidMutation_DoesNotOpenTransaction(bool poi)
    {
        var state = new RecordingState();
        await using var provider = CreateProvider(state);
        await Assert.ThrowsAsync<ValidationException>(() => SendAsync(provider, poi, valid: false));
        Assert.Empty(state.Events);
    }

    // Use the production registration order, rather than manually nesting behaviors in the test.
    private static ServiceProvider CreateProvider(RecordingState state)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication();
        services.AddSingleton(state);
        services.AddTransient<IRequestHandler<RegistrationMutation, string>, RegistrationHandler>();
        services.AddTransient<IRequestHandler<PoiMutation, string>, PoiHandler>();
        services.AddSingleton<IValidator<RegistrationMutation>, RegistrationValidator>();
        services.AddSingleton<IValidator<PoiMutation>, PoiValidator>();
        services.AddSingleton<IApplicationDbContext, CommitContext>();
        services.AddSingleton<IRegistrationTransaction, RegistrationTransaction>();
        services.AddSingleton<IPoiManagementTransaction, PoiTransaction>();
        return services.BuildServiceProvider();
    }

    private static Task<string> SendAsync(IServiceProvider provider, bool poi, bool valid = true) => poi
        ? provider.GetRequiredService<ISender>().Send(new PoiMutation(valid))
        : provider.GetRequiredService<ISender>().Send(new RegistrationMutation(valid));

    private sealed record RegistrationMutation(bool Valid) : IRegistrationMutationCommand<string>;
    private sealed record PoiMutation(bool Valid) : IPoiMutationCommand<string>;

    private sealed class RegistrationValidator : AbstractValidator<RegistrationMutation>
    {
        public RegistrationValidator() => RuleFor(c => c.Valid).Equal(true);
    }
    private sealed class PoiValidator : AbstractValidator<PoiMutation>
    {
        public PoiValidator() => RuleFor(c => c.Valid).Equal(true);
    }

    private sealed class RegistrationHandler(RecordingState state) : IRequestHandler<RegistrationMutation, string>
    {
        public Task<string> Handle(RegistrationMutation request, CancellationToken ct)
        { state.Record("handler"); return Task.FromResult("saved"); }
    }
    private sealed class PoiHandler(RecordingState state) : IRequestHandler<PoiMutation, string>
    {
        public Task<string> Handle(PoiMutation request, CancellationToken ct)
        { state.Record("handler"); return Task.FromResult("saved"); }
    }

    private sealed class RecordingState
    {
        public List<string> Events { get; } = [];
        public string? Failure { get; init; }
        public void Record(string stage)
        {
            Events.Add(stage);
            if (stage == Failure) throw new InvalidOperationException(stage);
        }
    }
    private sealed class CommitContext(RecordingState state) : IApplicationDbContext
    {
        public Task<int> SaveChangesAsync(CancellationToken ct = default)
        { state.Record("save"); return Task.FromResult(1); }
    }
    private sealed class RegistrationTransaction(RecordingState state) : IRegistrationTransaction
    {
        public Task<IRegistrationTransactionScope> BeginAsync(CancellationToken ct)
        { state.Record("begin"); return Task.FromResult<IRegistrationTransactionScope>(new TransactionScope(state)); }
    }
    private sealed class PoiTransaction(RecordingState state) : IPoiManagementTransaction
    {
        public Task<IPoiManagementTransactionScope> BeginAsync(CancellationToken ct = default)
        { state.Record("begin"); return Task.FromResult<IPoiManagementTransactionScope>(new TransactionScope(state)); }
    }
    private sealed class TransactionScope(RecordingState state) : IRegistrationTransactionScope, IPoiManagementTransactionScope
    {
        public Task CommitAsync(CancellationToken ct = default)
        { state.Record("commit"); return Task.CompletedTask; }
        public ValueTask DisposeAsync()
        { state.Record("dispose"); return ValueTask.CompletedTask; }
    }
}
