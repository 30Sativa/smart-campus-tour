namespace FleetEmulator.Tests;

public class SmokeTests
{
    [Fact]
    public void FleetEmulatorEntryPointIsAvailable()
    {
        Assert.NotNull(typeof(FleetEmulator.Program).GetMethod(nameof(FleetEmulator.Program.Main)));
    }
}
