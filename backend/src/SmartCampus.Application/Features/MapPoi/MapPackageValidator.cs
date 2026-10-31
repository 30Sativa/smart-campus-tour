using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using FluentValidation;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record MapPackageMetadata(
    string ImageFileName,
    int ImageWidth,
    int ImageHeight,
    decimal Resolution,
    decimal OriginX,
    decimal OriginY,
    decimal OriginYaw,
    bool Negate,
    decimal OccupiedThreshold,
    decimal FreeThreshold,
    string FrameId);

public sealed record ValidatedMapPackage(MapPackageMetadata Metadata, byte[] Pixels, byte[] Sha256, string YamlFileName);

/// <summary>Accepts the bounded ROS map-server format used in robot/robot_maps.</summary>
public static class MapPackageValidator
{
    public const int MaxPackageBytes = 33_554_432;
    private const int MaxRasterBytes = 33_554_432;
    private const int MaxPixels = 32_000_000;
    private const int MaxDimension = 8_192;

    public static ValidatedMapPackage Validate(ReadOnlyMemory<byte> package)
    {
        if (package.Length is <= 0 or > MaxPackageBytes)
            throw Invalid("package", $"Map package must be between 1 byte and {MaxPackageBytes} bytes.");

        try
        {
            using var stream = new MemoryStream(package.ToArray(), writable: false);
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: false);
            if (archive.Entries.Count != 2)
                throw Invalid("package", "A map package must contain one root-level ROS YAML file and its referenced PGM image only.");

            var files = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in archive.Entries)
            {
                var path = entry.FullName;
                if (string.IsNullOrWhiteSpace(path) || path.Contains('/') || path.Contains('\\') ||
                    path is "." or ".." || entry.Name != path || entry.Length <= 0 ||
                    !files.TryAdd(path, entry))
                    throw Invalid("package", "Map package paths must be unique root-level filenames without directories.");
                if (entry.Length > MaxRasterBytes || entry.CompressedLength > MaxPackageBytes)
                    throw Invalid("package", "A map package entry exceeds the supported size limit.");
            }

            var yamlEntries = files.Values.Where(entry =>
                entry.Name.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase) ||
                entry.Name.EndsWith(".yml", StringComparison.OrdinalIgnoreCase)).ToArray();
            if (yamlEntries.Length != 1)
                throw Invalid("package", "A map package must contain exactly one ROS map YAML file.");
            var yamlEntry = yamlEntries[0];

            var metadata = ParseYaml(ReadBounded(yamlEntry, 64 * 1024));
            if (!files.TryGetValue(metadata.ImageFileName, out var imageEntry) ||
                !imageEntry.Name.EndsWith(".pgm", StringComparison.OrdinalIgnoreCase))
                throw Invalid("image", "The YAML image must name the root-level PGM file in this package.");

            var pixels = ParsePgm(ReadBounded(imageEntry, MaxRasterBytes), out var width, out var height);
            if (width is <= 0 or > MaxDimension || height is <= 0 or > MaxDimension || (long)width * height > MaxPixels)
                throw Invalid("image", "The raster dimensions exceed the supported maximum of 8192 per side and 32 million pixels.");

            metadata = metadata with { ImageWidth = width, ImageHeight = height };
            return new ValidatedMapPackage(metadata, pixels, SHA256.HashData(package.Span), yamlEntry.Name);
        }
        catch (ValidationException)
        {
            throw;
        }
        catch (InvalidDataException exception)
        {
            throw Invalid("package", $"Map package is not a valid ZIP/PGM package: {exception.Message}");
        }
        catch (IOException exception)
        {
            throw Invalid("package", $"Map package could not be read: {exception.Message}");
        }
    }

    public static void EnsureFreePosition(ValidatedMapPackage map, decimal x, decimal y, decimal yaw)
    {
        if (yaw is < -3.141593m or > 3.141593m)
            throw Invalid("yaw", "POI yaw must be in radians from -π through π in the map frame.");

        var metadata = map.Metadata;
        var widthMeters = metadata.ImageWidth * metadata.Resolution;
        var heightMeters = metadata.ImageHeight * metadata.Resolution;
        var columnPosition = (x - metadata.OriginX) / metadata.Resolution;
        var rowFromBottom = (y - metadata.OriginY) / metadata.Resolution;
        if (columnPosition < 0 || rowFromBottom < 0 || columnPosition >= metadata.ImageWidth || rowFromBottom >= metadata.ImageHeight ||
            x >= metadata.OriginX + widthMeters || y >= metadata.OriginY + heightMeters)
            throw Invalid("position", "POI coordinates must fall inside the selected map version.");

        var column = (int)decimal.Floor(columnPosition);
        var row = metadata.ImageHeight - 1 - (int)decimal.Floor(rowFromBottom);
        var gray = map.Pixels[(row * metadata.ImageWidth) + column] / 255m;
        var occupancy = metadata.Negate ? gray : 1m - gray;
        if (occupancy >= metadata.OccupiedThreshold)
            throw Invalid("position", "POI coordinates land in an occupied cell.");
        if (occupancy >= metadata.FreeThreshold)
            throw Invalid("position", "POI coordinates land in an unknown occupancy cell.");
    }

    private static MapPackageMetadata ParseYaml(byte[] bytes)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var rawLine in System.Text.Encoding.UTF8.GetString(bytes).Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var separator = line.IndexOf(':');
            if (separator <= 0) throw Invalid("metadata", "Each ROS map YAML property must use key: value syntax.");
            var key = line[..separator].Trim();
            var value = StripComment(line[(separator + 1)..]).Trim();
            if (!values.TryAdd(key, Unquote(value)))
                throw Invalid("metadata", $"The ROS map YAML property '{key}' is duplicated.");
        }

        string Required(string key) => values.TryGetValue(key, out var value)
            ? value
            : throw Invalid("metadata", $"The ROS map YAML property '{key}' is required.");
        decimal Number(string key)
        {
            if (!decimal.TryParse(Required(key), NumberStyles.Float, CultureInfo.InvariantCulture, out var result))
                throw Invalid("metadata", $"The ROS map YAML property '{key}' must be numeric.");
            return result;
        }

        var image = Required("image");
        if (image.Length > 255 || image.Contains('/') || image.Contains('\\') || image is "." or ".." ||
            !image.EndsWith(".pgm", StringComparison.OrdinalIgnoreCase))
            throw Invalid("image", "The YAML image must be a safe root-level PGM filename.");
        if (!string.Equals(Required("mode"), "trinary", StringComparison.OrdinalIgnoreCase))
            throw Invalid("mode", "Only the repository's ROS map-server trinary mode is supported.");

        var originText = Required("origin").Trim();
        if (!originText.StartsWith('[') || !originText.EndsWith(']'))
            throw Invalid("origin", "Origin must be a three-number [x, y, yaw] array.");
        var originParts = originText[1..^1].Split(',', StringSplitOptions.TrimEntries);
        if (originParts.Length != 3 || originParts.Any(part =>
                !decimal.TryParse(part, NumberStyles.Float, CultureInfo.InvariantCulture, out _)))
            throw Invalid("origin", "Origin must be a three-number [x, y, yaw] array.");
        var origin = originParts.Select(part => decimal.Parse(part, CultureInfo.InvariantCulture)).ToArray();
        if (origin[2] != 0m)
            throw Invalid("origin", "Non-zero map origin yaw is not supported by the current Nav2 configuration.");

        var negateValue = Required("negate");
        if (negateValue is not ("0" or "1"))
            throw Invalid("negate", "Negate must be 0 or 1.");
        var resolution = Number("resolution");
        var occupied = Number("occupied_thresh");
        var free = Number("free_thresh");
        if (resolution is <= 0 or > 100 || occupied is < 0 or > 1 || free is < 0 or > 1 || free >= occupied)
            throw Invalid("metadata", "Resolution and occupancy thresholds are outside the supported ranges.");

        var required = new[] { "image", "mode", "resolution", "origin", "negate", "occupied_thresh", "free_thresh" };
        if (values.Keys.Except(required, StringComparer.Ordinal).Any())
            throw Invalid("metadata", "The map package contains unsupported ROS map metadata fields.");

        return new MapPackageMetadata(image, 0, 0, resolution, origin[0], origin[1], origin[2],
            negateValue == "1", occupied, free, "map");
    }

    private static byte[] ParsePgm(byte[] bytes, out int width, out int height)
    {
        var cursor = new PgmCursor(bytes);
        var magic = cursor.ReadToken();
        if (magic is not ("P2" or "P5")) throw Invalid("image", "Only ASCII P2 and binary P5 PGM rasters are supported.");
        if (!int.TryParse(cursor.ReadToken(), NumberStyles.None, CultureInfo.InvariantCulture, out width) || width <= 0 ||
            !int.TryParse(cursor.ReadToken(), NumberStyles.None, CultureInfo.InvariantCulture, out height) || height <= 0 ||
            !int.TryParse(cursor.ReadToken(), NumberStyles.None, CultureInfo.InvariantCulture, out var maxValue) || maxValue is <= 0 or > 255)
            throw Invalid("image", "PGM width, height and 8-bit maximum value are invalid.");
        if ((long)width * height > MaxPixels) throw Invalid("image", "The PGM raster exceeds 32 million pixels.");

        var count = checked(width * height);
        var result = new byte[count];
        if (magic == "P5")
        {
            cursor.SkipCrLfAfterHeader();
            if (cursor.Remaining != count)
                throw Invalid("image", "The binary PGM byte count does not match its declared dimensions.");
            var raw = cursor.ReadRemaining();
            for (var index = 0; index < count; index++)
                result[index] = (byte)((raw[index] * 255L + (maxValue / 2)) / maxValue);
        }
        else
        {
            for (var index = 0; index < count; index++)
            {
                if (!int.TryParse(cursor.ReadToken(), NumberStyles.None, CultureInfo.InvariantCulture, out var sample) || sample < 0 || sample > maxValue)
                    throw Invalid("image", "ASCII PGM samples must fit the declared maximum value.");
                result[index] = (byte)((sample * 255L + (maxValue / 2)) / maxValue);
            }
            if (cursor.TryReadToken(out _)) throw Invalid("image", "ASCII PGM contains more pixels than its declared dimensions.");
        }
        return result;
    }

    private static byte[] ReadBounded(ZipArchiveEntry entry, int maxBytes)
    {
        if (entry.Length > maxBytes) throw Invalid("package", "A map package entry exceeds the supported size limit.");
        using var input = entry.Open();
        using var output = new MemoryStream((int)entry.Length);
        var buffer = new byte[8192];
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (output.Length + read > maxBytes) throw Invalid("package", "A map package entry exceeds the supported size limit.");
            output.Write(buffer, 0, read);
        }
        return output.ToArray();
    }

    private static string StripComment(string value) => value.Split('#', 2)[0];
    private static string Unquote(string value) => value.Length >= 2 &&
        ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\''))
            ? value[1..^1]
            : value;

    private static ValidationException Invalid(string field, string message) =>
        new([new FluentValidation.Results.ValidationFailure(field, message)]);

    private sealed class PgmCursor(byte[] bytes)
    {
        private int _position;
        public int Remaining => bytes.Length - _position;

        public string ReadToken() => TryReadToken(out var value)
            ? value
            : throw Invalid("image", "The PGM header or raster ended unexpectedly.");

        public bool TryReadToken(out string value)
        {
            SkipWhitespaceAndComments();
            if (_position >= bytes.Length) { value = string.Empty; return false; }
            var start = _position;
            while (_position < bytes.Length && !IsWhitespace(bytes[_position]) && bytes[_position] != '#') _position++;
            if (_position == start) { value = string.Empty; return false; }
            value = System.Text.Encoding.ASCII.GetString(bytes, start, _position - start);
            if (_position < bytes.Length && bytes[_position] == '#') SkipComment();
            else if (_position < bytes.Length) _position++;
            return true;
        }

        public void SkipCrLfAfterHeader()
        {
            // TryReadToken consumes one delimiter. Consume only the LF paired with a consumed CR;
            // the first raster byte may itself be whitespace or a line-ending byte.
            if (_position < bytes.Length && _position > 0 &&
                bytes[_position - 1] == '\r' && bytes[_position] == '\n')
                _position++;
        }

        public ReadOnlySpan<byte> ReadRemaining() => bytes.AsSpan(_position);

        private void SkipWhitespaceAndComments()
        {
            while (_position < bytes.Length)
            {
                if (IsWhitespace(bytes[_position])) { _position++; continue; }
                if (bytes[_position] == '#') { SkipComment(); continue; }
                break;
            }
        }

        private void SkipComment()
        {
            while (_position < bytes.Length && bytes[_position] is not (byte)'\r' and not (byte)'\n') _position++;
            if (_position < bytes.Length) _position++;
        }

        private static bool IsWhitespace(byte value) => value is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n' or (byte)'\f';
    }
}
