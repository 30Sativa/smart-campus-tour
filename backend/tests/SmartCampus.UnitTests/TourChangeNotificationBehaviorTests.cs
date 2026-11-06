using MediatR;
using SmartCampus.Application.Common.Abstractions.Tours;
using SmartCampus.Application.Common.Behaviors;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Queries.GetTours;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.UnitTests;

public sealed class TourChangeNotificationBehaviorTests
{
    private readonly CountingNotifier notifier = new();

    [Fact]
    public async Task ATourCommand_TellsAfterItSucceeded()
    {
        var behavior = new TourChangeNotificationBehavior<MarkTourReadyCommand, TourMutationResult>(notifier);
        var told = -1;
        await behavior.Handle(new MarkTourReadyCommand(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), "AAAA")), _ =>
        {
            told = notifier.Count; // Not yet: the handler and the commits inside the pipeline come first.
            return Task.FromResult(new TourMutationResult(Guid.NewGuid()));
        }, CancellationToken.None);

        Assert.Equal((0, 1), (told, notifier.Count));
    }

    [Fact]
    public async Task AFailedTourCommand_TellsNothing()
    {
        var behavior = new TourChangeNotificationBehavior<MarkTourReadyCommand, TourMutationResult>(notifier);
        await Assert.ThrowsAsync<InvalidOperationException>(() => behavior.Handle(
            new MarkTourReadyCommand(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), "AAAA")),
            _ => throw new InvalidOperationException(), CancellationToken.None));
        Assert.Equal(0, notifier.Count);
    }

    [Fact]
    public async Task ATourQuery_OrAnotherFeaturesCommand_TellsNothing()
    {
        await new TourChangeNotificationBehavior<GetToursQuery, PagedResult<TourSummary>>(notifier).Handle(
            new GetToursQuery(new(null, "scheduledStartAt", 1, 20, null, null, null)),
            _ => Task.FromResult(new PagedResult<TourSummary>([], 1, 20, 0)), CancellationToken.None);
        await new TourChangeNotificationBehavior<DeactivateAccountCommand, Unit>(notifier).Handle(
            new DeactivateAccountCommand(Guid.NewGuid(), Guid.NewGuid()), _ => Task.FromResult(Unit.Value), CancellationToken.None);
        Assert.Equal(0, notifier.Count);
    }

    private sealed class CountingNotifier : ITourChangeNotifier
    {
        public int Count { get; private set; }
        public void TourChanged() => Count++;
    }
}
