using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

public sealed class MapPackageValidatorTests
{
    [Fact]
    public void Valid_ros_map_package_records_metadata_checksum_and_accepts_free_cell()
    {
        var bytes = Package("image: campus.pgm\nmode: trinary\nresolution: 0.05\norigin: [-1.0, -2.0, 0.0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
            Pgm("P2\n3 2\n255\n255 255 255 255 255 255\n"));

        var validated = MapPackageValidator.Validate(bytes);

        Assert.Equal("campus.pgm", validated.Metadata.ImageFileName);
        Assert.Equal(3, validated.Metadata.ImageWidth);
        Assert.Equal(2, validated.Metadata.ImageHeight);
        Assert.Equal("map", validated.Metadata.FrameId);
        Assert.Equal(SHA256.HashData(bytes), validated.Sha256);
        MapPackageValidator.EnsureFreePosition(validated, -0.975m, -1.975m, 0m);
    }

    [Theory]
    [InlineData(0, 0, 0.5, 0.5)]
    [InlineData(-1, -2, -0.5, -1.5)]
    [InlineData(3, 4, 4.5, 5.5)]
    public void Free_position_uses_world_coordinates_relative_to_map_origin(int originX, int originY, double x, double y)
    {
        var map = MapPackageValidator.Validate(Package(
            $"image: campus.pgm\nmode: trinary\nresolution: 1\norigin: [{originX}, {originY}, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
            Pgm("P2\n2 2\n255\n255 255 255 255\n")));

        MapPackageValidator.EnsureFreePosition(map, (decimal)x, (decimal)y, 0m);
    }

    [Theory]
    [InlineData(false, 0x0A)]
    [InlineData(false, 0x0D)]
    [InlineData(false, 0x20)]
    [InlineData(false, 0x23)]
    [InlineData(true, 0x0A)]
    [InlineData(true, 0x0D)]
    [InlineData(true, 0x20)]
    [InlineData(true, 0x23)]
    public void Binary_p5_preserves_first_raster_byte_after_lf_or_crlf_header(bool crlf, int firstPixel)
    {
        var newline = crlf ? "\r\n" : "\n";
        var header = Encoding.ASCII.GetBytes($"P5{newline}1 1{newline}255{newline}");
        var pgm = header.Concat(new[] { (byte)firstPixel }).ToArray();
        var bytes = Package("image: campus.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n", pgm);

        var validated = MapPackageValidator.Validate(bytes);

        Assert.Equal(new[] { (byte)firstPixel }, validated.Pixels);
    }

    [Fact]
    public void Rejects_nonzero_origin_yaw()
    {
        var bytes = Package("image: campus.pgm\nmode: trinary\nresolution: 0.05\norigin: [-1, -2, 0.1]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
            Pgm("P2\n1 1\n255\n255\n"));
        Assert.Throws<ValidationException>(() => MapPackageValidator.Validate(bytes));
    }

    [Theory]
    [InlineData(0, "occupied")]
    [InlineData(127, "unknown")]
    public void Rejects_positions_on_occupied_or_unknown_cells(int gray, string _)
    {
        var bytes = Package("image: campus.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
            Pgm($"P2\n1 1\n255\n{gray}\n"));
        var map = MapPackageValidator.Validate(bytes);
        Assert.Throws<ValidationException>(() => MapPackageValidator.EnsureFreePosition(map, 0.5m, 0.5m, 0m));
    }

    [Fact]
    public void Rejects_coordinates_outside_map()
    {
        var map = MapPackageValidator.Validate(Package("image: campus.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
            Pgm("P2\n1 1\n255\n255\n")));
        Assert.Throws<ValidationException>(() => MapPackageValidator.EnsureFreePosition(map, 1m, 0.5m, 0m));
    }

    [Fact]
    public void Rejects_package_path_traversal()
    {
        var bytes = Package("image: ../campus.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
            Pgm("P2\n1 1\n255\n255\n"));
        Assert.Throws<ValidationException>(() => MapPackageValidator.Validate(bytes));
    }

    private static byte[] Package(string yaml, byte[] pgm)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            Write(archive, "map.yaml", Encoding.UTF8.GetBytes(yaml));
            Write(archive, "campus.pgm", pgm);
        }
        return stream.ToArray();
    }

    private static byte[] Pgm(string text) => Encoding.ASCII.GetBytes(text);

    private static void Write(ZipArchive archive, string name, byte[] bytes)
    {
        var entry = archive.CreateEntry(name);
        using var output = entry.Open();
        output.Write(bytes);
    }
}
