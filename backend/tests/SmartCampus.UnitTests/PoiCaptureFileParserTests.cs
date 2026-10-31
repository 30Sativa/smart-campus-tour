using System.IO.Compression;
using System.Text;
using FluentValidation;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.UnitTests;

public sealed class PoiCaptureFileParserTests
{
    private const string Sample = """
        # Recorded from the robot's actual pose after reaching the spot.
        id: POI_02
        name: POI 02
        map_yaml: map2.yaml
        frame_id: map

        pose:
          x: 29.692
          y: -5.439
          yaw: -0.291

          quaternion:
            x: 0.0
            y: 0.0
            z: -0.14493
            w: 0.98944

        verified: true
        """;

    [Fact]
    public void Parse_ReadsTheRobotFormat_WithCommentsPresent()
    {
        var capture = Parse(Sample);

        Assert.Equal("POI_02", capture.Id);
        Assert.Equal("POI 02", capture.Name);
        Assert.Equal("map2.yaml", capture.MapYaml);
        Assert.Equal("map", capture.FrameId);
        Assert.Equal(29.692m, capture.X);
        Assert.Equal(-5.439m, capture.Y);
        Assert.Equal(-0.291m, capture.Yaw);
        Assert.True(capture.Verified);
        Assert.Equal(-0.291d, capture.Quaternion!.Yaw, 0.001d);
    }

    [Fact]
    public void Parse_AcceptsFlowStyle_AndAnOptionalQuaternion()
    {
        var capture = Parse("id: START\nname: Tour Start\nmap_yaml: map2.yaml\nframe_id: map\npose: { x: -0.319, y: -0.535, yaw: 0.077 }\nverified: false\n");

        Assert.Null(capture.Quaternion);
        Assert.False(capture.Verified);
    }

    [Theory]
    [InlineData("poi_01.yaml")]
    [InlineData("poi_start.yaml")]
    [InlineData("poi_records/poi_02.yaml")]
    [InlineData("poi_records/poi_03.yaml")]
    public void Parse_AcceptsEveryRecordedFileInTheRepository(string relativePath)
    {
        var capture = PoiCaptureFileParser.Parse(File.ReadAllBytes(RobotMapFile(relativePath)));

        Assert.Equal("map2.yaml", capture.MapYaml);
        var wrapped = Math.IEEERemainder(capture.Quaternion!.Yaw - (double)capture.Yaw, 2d * Math.PI);
        Assert.True(Math.Abs(wrapped) <= 0.01d);
    }

    [Theory]
    [InlineData("id: POI_02\nid: POI_03\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: true\n", "DUPLICATE_KEY")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, x: 2, y: 1, yaw: 0}\nverified: true\n", "DUPLICATE_KEY")]
    [InlineData("id: 'bad id!'\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: true\n", "INVALID_ID")]
    [InlineData("name: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: true\n", "MISSING_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, yaw: 0}\nverified: true\n", "MISSING_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\n", "MISSING_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0, quaternion: {x: 0, y: 0, z: 0}}\nverified: true\n", "MISSING_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: '1', y: 1, yaw: 0}\nverified: true\n", "INVALID_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: .nan}\nverified: true\n", "INVALID_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: yes\n", "INVALID_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0, quaternion: {x: 0, y: 0, z: 0, w: 0}}\nverified: true\n", "INVALID_FIELD")]
    [InlineData("id: A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: true\ncamera_preset: LEFT\n", "UNKNOWN_FIELD")]
    [InlineData("id: &a A\nname: *a\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: true\n", "INVALID_YAML")]
    [InlineData("id: !!python/object:os.system A\nname: A\nmap_yaml: m.yaml\nframe_id: map\npose: {x: 1, y: 1, yaw: 0}\nverified: true\n", "INVALID_YAML")]
    [InlineData("id: A\n---\nid: B\n", "INVALID_YAML")]
    [InlineData("- id: A\n", "INVALID_YAML")]
    [InlineData("id: [unclosed\n", "INVALID_YAML")]
    [InlineData("", "INVALID_YAML")]
    public void Parse_RejectsWithAStableCode(string yaml, string code)
    {
        var error = Assert.Throws<PoiCaptureFileException>(() => Parse(yaml));
        Assert.Equal(code, error.Code);
        Assert.False(string.IsNullOrWhiteSpace(error.Message));
    }

    [Fact]
    public void Parse_RejectsBytesThatAreNotUtf8() =>
        Assert.Equal("INVALID_YAML", Assert.Throws<PoiCaptureFileException>(() => PoiCaptureFileParser.Parse([0xC3, 0x28])).Code);

    [Fact]
    public void Parse_RejectsDeepNestingWithoutRecursingThroughIt()
    {
        var error = Assert.Throws<PoiCaptureFileException>(() => Parse("id: " + new string('{', 20_000)));
        Assert.Equal("INVALID_YAML", error.Code);
    }

    [Fact]
    public void Expand_KeepsAnOversizeFileAsItsOwnFailure_NotARequestFailure()
    {
        var sources = PoiImportFileSet.Expand([new("big.yaml", new byte[PoiCaptureFileParser.MaxFileBytes + 1]), new("ok.yaml", [1])]);

        Assert.True(sources[0].TooLarge);
        Assert.False(sources[1].TooLarge);
    }

    [Fact]
    public void Expand_AcceptsExactlyTheMaximumSize() =>
        Assert.False(PoiImportFileSet.Expand([new("full.yaml", new byte[PoiCaptureFileParser.MaxFileBytes])])[0].TooLarge);

    [Fact]
    public void Expand_RejectsMoreThanFiftyFiles() =>
        Assert.Throws<ValidationException>(() => PoiImportFileSet.Expand(
            Enumerable.Range(0, PoiImportFileSet.MaxFiles + 1).Select(index => new PoiImportUpload($"{index}.yaml", [1])).ToArray()));

    [Fact]
    public void Expand_ReadsYamlFromTheRootOfOneZip()
    {
        var sources = PoiImportFileSet.Expand([new("poi.zip", Zip(("a.yaml", 10), ("b.yml", 10)))]);

        Assert.Equal(["a.yaml", "b.yml"], sources.Select(source => source.FileName));
        Assert.All(sources, source => Assert.Equal(10, source.Content.Length));
    }

    [Fact]
    public void Expand_FlagsAHighlyCompressedOversizeEntryWithoutKeepingIt()
    {
        var source = Assert.Single(PoiImportFileSet.Expand([new("poi.zip", Zip(("bomb.yaml", 10 * 1024 * 1024)))]));

        Assert.True(source.TooLarge);
        Assert.Empty(source.Content);
    }

    [Fact]
    public void Expand_RejectsNestedPaths_MixedUploads_AndBrokenZips()
    {
        Assert.Throws<ValidationException>(() => PoiImportFileSet.Expand([new("poi.zip", Zip(("dir/a.yaml", 10)))]));
        Assert.Throws<ValidationException>(() => PoiImportFileSet.Expand([new("poi.zip", Zip(("a.yaml", 10))), new("b.yaml", [1])]));
        Assert.Throws<ValidationException>(() => PoiImportFileSet.Expand([new("poi.zip", [1, 2, 3])]));
        Assert.Throws<ValidationException>(() => PoiImportFileSet.Expand([]));
    }

    [Fact]
    public void Expand_DropsAnyClientPathFromTheFileName() =>
        Assert.Equal("a.yaml", PoiImportFileSet.Expand([new("..\\..\\a.yaml", [1])])[0].FileName);

    private static PoiCaptureFile Parse(string yaml) => PoiCaptureFileParser.Parse(Encoding.UTF8.GetBytes(yaml));

    private static string RobotMapFile(string relativePath)
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "robot", "robot_maps", relativePath);
            if (File.Exists(candidate)) return candidate;
        }
        throw new FileNotFoundException(relativePath);
    }

    private static byte[] Zip(params (string Name, int Bytes)[] entries)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var (name, bytes) in entries)
            {
                using var entry = archive.CreateEntry(name).Open();
                entry.Write(new byte[bytes]);
            }
        return stream.ToArray();
    }
}
