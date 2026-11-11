using System.Text.Json;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.UnitTests;

/// <summary>
/// The shipped `Tours:Shifts` in appsettings.json: it must start the server, and it keeps the
/// one-hour charging break between shifts that docs/lich-tour-theo-ca.md §3 requires.
/// </summary>
public sealed class TourShiftsConfigurationTests
{
    private static TourShiftOption[] ShippedShifts()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "src", "SmartCampus.Api", "appsettings.json")))
            directory = directory.Parent;
        Assert.NotNull(directory);
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory.FullName, "src", "SmartCampus.Api", "appsettings.json")));
        return json.RootElement.GetProperty("Tours").GetProperty("Shifts").EnumerateArray()
            .Select(shift => TourShiftsFixture.Shift(shift.GetProperty("Code").GetString()!, shift.GetProperty("Name").GetString()!,
                shift.GetProperty("Start").GetString()!, shift.GetProperty("End").GetString()!))
            .ToArray();
    }

    [Fact]
    public void Shipped_shifts_are_accepted_and_keep_an_hour_between_them()
    {
        var settings = new TourScheduleSettings(ShippedShifts(), 60);

        Assert.Equal(new[] { "S1", "S4", "S2", "S3", "S5" }, settings.Shifts.Select(shift => shift.Code).ToArray());
        for (var index = 1; index < settings.Shifts.Count; index++)
            Assert.True(settings.Shifts[index].Start - settings.Shifts[index - 1].End >= TimeSpan.FromHours(1),
                $"{settings.Shifts[index - 1].Code} and {settings.Shifts[index].Code} leave less than an hour to charge.");
    }

    [Fact]
    public void Existing_shift_codes_keep_their_hours_because_saved_Tours_point_at_them()
    {
        var shifts = ShippedShifts().ToDictionary(shift => shift.Code!);

        Assert.Equal("08:00-10:00", $"{shifts["S1"].Start}-{shifts["S1"].End}");
        Assert.Equal("13:00-15:00", $"{shifts["S2"].Start}-{shifts["S2"].End}");
        Assert.Equal("16:00-18:00", $"{shifts["S3"].Start}-{shifts["S3"].End}");
    }
}
