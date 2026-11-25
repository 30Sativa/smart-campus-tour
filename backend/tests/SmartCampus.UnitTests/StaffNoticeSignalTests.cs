using MediatR;
using SmartCampus.Application.Common.Behaviors;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.StaffNotifications;
using SmartCampus.Application.Features.Tours.Commands.ReleaseRobotInspection;

namespace SmartCampus.UnitTests;

public sealed class StaffNoticeSignalTests
{
    private readonly CountingNotifier notifier = new();

    private static ReleaseRobotInspectionCommand Release() =>
        new(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), "AAAA", "Đã kiểm tra pin và cảm biến."));

    [Fact]
    public async Task ATechnicalOutcome_TellsTheBellsAfterItSucceeded()
    {
        var behavior = new StaffNoticeNotificationBehavior<ReleaseRobotInspectionCommand, ReleaseRobotInspectionResult>(notifier);
        var told = -1;
        await behavior.Handle(Release(), _ =>
        {
            told = notifier.Count; // Not yet: the handler and the commits inside the pipeline come first.
            return Task.FromResult(new ReleaseRobotInspectionResult(Guid.NewGuid()));
        }, CancellationToken.None);

        Assert.Equal((0, 1), (told, notifier.Count));
    }

    [Fact]
    public async Task AFailedTechnicalOutcome_TellsNothing()
    {
        var behavior = new StaffNoticeNotificationBehavior<ReleaseRobotInspectionCommand, ReleaseRobotInspectionResult>(notifier);
        await Assert.ThrowsAsync<InvalidOperationException>(() => behavior.Handle(Release(),
            _ => throw new InvalidOperationException(), CancellationToken.None));
        Assert.Equal(0, notifier.Count);
    }

    [Fact]
    public async Task AnotherCommand_TellsNothing()
    {
        await new StaffNoticeNotificationBehavior<DeactivateAccountCommand, Unit>(notifier).Handle(
            new DeactivateAccountCommand(Guid.NewGuid(), Guid.NewGuid()), _ => Task.FromResult(Unit.Value), CancellationToken.None);
        Assert.Equal(0, notifier.Count);
    }

    /// <summary>Every command that writes one of <see cref="StaffNotificationActions.All"/>; a new one must join this list.</summary>
    [Fact]
    public void EveryCommandWritingAStaffNotificationAction_CarriesTheMarker()
    {
        var marked = typeof(IStaffNoticeCommand).Assembly.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false } && typeof(IStaffNoticeCommand).IsAssignableFrom(type))
            .Select(type => type.Name).Order().ToArray();

        Assert.Equal(new[]
        {
            nameof(ImportPoiFilesCommand),              // POI_POSE_CAPTURE_VERIFIED
            nameof(RecordMapDeploymentCommand),         // MAP_DEPLOYMENT_CHECK_RECORDED
            nameof(RecordPoiVerificationCommand),       // POI_TECHNICAL_VERIFIED / POI_TECHNICAL_REJECTED
            nameof(RecordRouteTestRunCommand),          // ROUTE_TEST_PASSED / ROUTE_TEST_FAILED
            nameof(ReleaseRobotInspectionCommand),      // ROBOT_INSPECTION_RELEASED
        }, marked);
    }

    private sealed class CountingNotifier : IStaffNoticeNotifier
    {
        public int Count { get; private set; }
        public void StaffNoticesChanged() => Count++;
    }
}
