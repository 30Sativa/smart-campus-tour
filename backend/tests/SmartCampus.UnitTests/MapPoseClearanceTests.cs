using System.IO.Compression;
using System.Text;
using FluentValidation;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

public sealed class MapPoseClearanceTests
{
    private const decimal Clearance = 0.30m;
    private const int Free = 254;
    private const int Occupied = 0;
    private const int Unknown = 205;

    [Fact]
    public void Open_floor_passes()
    {
        MapPackageValidator.EnsureClearPosition(Map(), 1.05m, 1.05m, 0m, Clearance);
    }

    [Theory]
    [InlineData(1.10, true)]    // The wall's near edge at 1.40 is exactly the radius away.
    [InlineData(1.0999, false)]
    [InlineData(1.05, false)]
    public void A_wall_cell_counts_up_to_and_including_the_radius(double x, bool rejected)
    {
        var map = Map((14, 10, Occupied));

        AssertClearance(map, (decimal)x, 1.05m, rejected);
    }

    [Theory]
    [InlineData(1.10, 1.10, true)]
    [InlineData(1.05, 1.05, false)]
    public void A_cell_is_measured_to_its_nearest_corner_so_a_circle_leaves_its_bounding_box_corners(double x, double y, bool rejected)
    {
        // The cell spans 1.3 to 1.4 on both axes: its corner is 0.28 m from the first pose and 0.35 m from the second.
        var map = Map((13, 13, Occupied));

        AssertClearance(map, (decimal)x, (decimal)y, rejected);
    }

    [Fact]
    public void Unknown_cells_inside_the_circle_are_refused_like_obstacles()
    {
        var map = Map((10, 12, Unknown));

        AssertClearance(map, 1.05m, 1.05m, true);
        AssertClearance(map, 1.05m, 0.85m, false);
    }

    [Theory]
    [InlineData(0.30, 1.05, true)]
    [InlineData(0.3001, 1.05, false)]
    [InlineData(1.70, 1.05, true)]
    [InlineData(1.6999, 1.05, false)]
    [InlineData(1.05, 0.30, true)]
    [InlineData(1.05, 0.3001, false)]
    [InlineData(1.05, 1.70, true)]
    [InlineData(1.05, 1.6999, false)]
    public void The_map_edge_counts_as_not_free(double x, double y, bool rejected)
    {
        AssertClearance(Map(), (decimal)x, (decimal)y, rejected);
    }

    [Fact]
    public void Coarse_cells_cannot_hide_a_wall_that_the_circle_touches()
    {
        // At 1 m per cell the wall cell's center is far away, but its edge is only 0.1 m from the pose.
        var map = Validate("resolution: 1\norigin: [0, 0, 0]\nnegate: 0\n", 4, 4, (0, 1, Occupied));

        AssertClearance(map, 1.1m, 1.5m, true);
        AssertClearance(map, 1.5m, 1.5m, false);
    }

    [Fact]
    public void Origin_and_negate_are_respected()
    {
        var map = Validate("resolution: 0.1\norigin: [-1, -2, 0]\nnegate: 1\n", 20, 20, (14, 10, 254), invertBackground: true);

        AssertClearance(map, 0.10m, -0.95m, true);
        AssertClearance(map, 0.05m, -0.95m, false);
    }

    [Fact]
    public void The_pose_own_cell_keeps_the_single_cell_failure()
    {
        var map = Map((10, 10, Occupied));

        var error = Assert.Throws<ValidationException>(() => MapPackageValidator.EnsureClearPosition(map, 1.05m, 1.05m, 0m, Clearance));

        Assert.Equal("POI coordinates land in an occupied cell.", error.Errors.Single().ErrorMessage);
        Assert.NotEqual(MapPoiErrorCodes.PoseClearanceInsufficient, error.Errors.Single().ErrorCode);
    }

    [Theory]
    [InlineData(0.30, "Điểm quá sát vật cản (cần trống bán kính 0,30 m).")]
    [InlineData(0.5, "Điểm quá sát vật cản (cần trống bán kính 0,50 m).")]
    public void The_message_states_the_configured_radius(double clearance, string message)
    {
        var failure = Assert.Single(Assert.Throws<ValidationException>(() =>
            MapPackageValidator.EnsureClearPosition(Map((12, 10, Occupied)), 1.05m, 1.05m, 0m, (decimal)clearance)).Errors);

        Assert.Equal(message, failure.ErrorMessage);
        Assert.Equal(MapPoiErrorCodes.PoseClearanceInsufficient, failure.ErrorCode);
    }

    [Fact]
    public void Settings_default_to_thirty_centimeters_and_refuse_a_radius_that_cannot_work()
    {
        Assert.Equal(0.30m, new MapPoiSettings(null).PoiClearanceMeters);
        Assert.Equal(0.45m, new MapPoiSettings(0.45m).PoiClearanceMeters);
        Assert.Throws<InvalidOperationException>(() => new MapPoiSettings(0m));
        Assert.Throws<InvalidOperationException>(() => new MapPoiSettings(-0.1m));
        Assert.Throws<InvalidOperationException>(() => new MapPoiSettings(6m));
    }

    private static void AssertClearance(ValidatedMapPackage map, decimal x, decimal y, bool rejected)
    {
        if (!rejected)
        {
            MapPackageValidator.EnsureClearPosition(map, x, y, 0m, Clearance);
            return;
        }
        var failure = Assert.Single(Assert.Throws<ValidationException>(() => MapPackageValidator.EnsureClearPosition(map, x, y, 0m, Clearance)).Errors);
        Assert.Equal(MapPoiErrorCodes.PoseClearanceInsufficient, failure.ErrorCode);
    }

    /// <summary>A 2 x 2 m map of 0.1 m cells; each listed cell is (column, row counted from the bottom, gray).</summary>
    private static ValidatedMapPackage Map(params (int Column, int RowFromBottom, int Gray)[] cells) =>
        Validate("resolution: 0.1\norigin: [0, 0, 0]\nnegate: 0\n", 20, 20, cells);

    private static ValidatedMapPackage Validate(string metadata, int width, int height, params (int Column, int RowFromBottom, int Gray)[] cells) =>
        Validate(metadata, width, height, invertBackground: false, cells);

    private static ValidatedMapPackage Validate(string metadata, int width, int height, (int Column, int RowFromBottom, int Gray) cell, bool invertBackground) =>
        Validate(metadata, width, height, invertBackground, cell);

    private static ValidatedMapPackage Validate(string metadata, int width, int height, bool invertBackground, params (int Column, int RowFromBottom, int Gray)[] cells)
    {
        var samples = new int[width * height];
        Array.Fill(samples, invertBackground ? 0 : Free);
        foreach (var (column, rowFromBottom, gray) in cells)
            samples[(height - 1 - rowFromBottom) * width + column] = gray;
        var pgm = $"P2\n{width} {height}\n255\n{string.Join(' ', samples)}\n";
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            Write(archive, "map.yaml", $"image: map.pgm\nmode: trinary\n{metadata}occupied_thresh: 0.65\nfree_thresh: 0.196\n");
            Write(archive, "map.pgm", pgm);
        }
        return MapPackageValidator.Validate(stream.ToArray());
    }

    private static void Write(ZipArchive archive, string name, string text)
    {
        using var output = archive.CreateEntry(name).Open();
        output.Write(Encoding.ASCII.GetBytes(text));
    }
}
