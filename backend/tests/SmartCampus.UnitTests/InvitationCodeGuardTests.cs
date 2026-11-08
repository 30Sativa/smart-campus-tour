using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;

namespace SmartCampus.UnitTests;

public sealed class InvitationCodeGuardTests
{
    private static readonly byte[] Code = [1, 2, 3];
    private const string Ip = "10.0.0.1";

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 8, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static (InvitationCodeGuard Guard, Clock Clock) Create(int failures = 5, int window = 10, int lockMinutes = 15)
    {
        var clock = new Clock();
        return (new(new(failures, window, lockMinutes), clock), clock);
    }

    private static void Fail(InvitationCodeGuard guard, int times)
    {
        for (var attempt = 0; attempt < times; attempt++) guard.RecordFailure(Code, Ip);
    }

    [Fact]
    public void FourFailures_DoNotLock_TheFifthDoes()
    {
        var (guard, _) = Create();
        Fail(guard, 4);
        guard.EnsureNotLocked(Code, Ip);
        Fail(guard, 1);
        Assert.Equal(InvitationCodeGuard.LockedCode, Assert.Throws<TooManyRequestsException>(() => guard.EnsureNotLocked(Code, Ip)).Code);
    }

    [Fact]
    public void FailuresOlderThanTheWindow_StartOver()
    {
        var (guard, clock) = Create();
        Fail(guard, 4);
        clock.Now = clock.Now.AddMinutes(10);
        Fail(guard, 4);
        guard.EnsureNotLocked(Code, Ip);
    }

    [Fact]
    public void ACorrectCode_ClearsTheCounter()
    {
        var (guard, _) = Create();
        Fail(guard, 4);
        guard.Clear(Code, Ip);
        Fail(guard, 4);
        guard.EnsureNotLocked(Code, Ip);
    }

    [Fact]
    public void TheConfiguredValues_AreUsed_AndTheLockCountsDownInMinutes()
    {
        var (guard, clock) = Create(failures: 2, lockMinutes: 3);
        Fail(guard, 2);
        clock.Now = clock.Now.AddMinutes(1).AddSeconds(30);
        Assert.Contains("2 phút", Assert.Throws<TooManyRequestsException>(() => guard.EnsureNotLocked(Code, Ip)).Message);
        clock.Now = clock.Now.AddMinutes(2);
        guard.EnsureNotLocked(Code, Ip);
    }

    [Fact]
    public void AnotherIpOrCode_IsNotAffected()
    {
        var (guard, _) = Create(failures: 1);
        Fail(guard, 1);
        guard.EnsureNotLocked(Code, "10.0.0.2");
        guard.EnsureNotLocked([9], Ip);
    }
}
