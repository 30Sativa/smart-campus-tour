using System.IO.Compression;
using FluentValidation;
using FluentValidation.Results;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record PoiImportSource(string FileName, byte[] Content, bool TooLarge);

/// <summary>Turns the upload into bounded source files: loose YAML, or one ZIP holding them at its root.</summary>
public static class PoiImportFileSet
{
    public const int MaxFiles = 50;
    public const int MaxUploadBytes = (MaxFiles * PoiCaptureFileParser.MaxFileBytes) + (1024 * 1024);
    private const int MaxFileNameLength = 255;

    public static IReadOnlyList<PoiImportSource> Expand(IReadOnlyList<PoiImportUpload>? uploads)
    {
        if (uploads is null || uploads.Count == 0) throw Invalid("Cần chọn ít nhất một tệp POI.");
        if (uploads.Count > MaxFiles) throw Invalid($"Mỗi lần nhập tối đa {MaxFiles} tệp.");

        if (uploads.Any(upload => IsZip(upload.FileName)))
        {
            if (uploads.Count != 1) throw Invalid("Chỉ được chọn một tệp ZIP, không kèm tệp khác.");
            return ExpandZip(uploads[0]);
        }

        return uploads.Select(upload => new PoiImportSource(SafeName(upload.FileName), upload.Content,
            upload.Content.Length > PoiCaptureFileParser.MaxFileBytes)).ToArray();
    }

    public static bool HasYamlExtension(string fileName) =>
        fileName.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase) ||
        fileName.EndsWith(".yml", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyList<PoiImportSource> ExpandZip(PoiImportUpload upload)
    {
        if (upload.Content.Length > MaxUploadBytes) throw Invalid("Tệp ZIP vượt quá dung lượng cho phép.");
        try
        {
            using var stream = new MemoryStream(upload.Content, writable: false);
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: false);
            if (archive.Entries.Count == 0) throw Invalid("Tệp ZIP không có tệp POI nào.");
            if (archive.Entries.Count > MaxFiles) throw Invalid($"Mỗi lần nhập tối đa {MaxFiles} tệp.");

            var sources = new List<PoiImportSource>(archive.Entries.Count);
            foreach (var entry in archive.Entries)
            {
                if (entry.FullName.Contains('/') || entry.FullName.Contains('\\') || entry.Name != entry.FullName)
                    throw Invalid("Tệp POI phải nằm ở thư mục gốc của ZIP, không có thư mục con.");
                var content = ReadBounded(entry);
                sources.Add(new PoiImportSource(SafeName(entry.Name), content ?? [], content is null));
            }
            return sources;
        }
        catch (InvalidDataException)
        {
            throw Invalid("Tệp ZIP không hợp lệ.");
        }
    }

    /// <summary>Counts the bytes actually inflated: an entry's declared length is attacker-controlled.</summary>
    private static byte[]? ReadBounded(ZipArchiveEntry entry)
    {
        if (entry.Length > PoiCaptureFileParser.MaxFileBytes) return null;
        using var input = entry.Open();
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (output.Length + read > PoiCaptureFileParser.MaxFileBytes) return null;
            output.Write(buffer, 0, read);
        }
        return output.ToArray();
    }

    private static string SafeName(string fileName)
    {
        var name = fileName.Split('/', '\\')[^1].Trim();
        if (name.Length is 0 or > MaxFileNameLength || name.Any(char.IsControl))
            throw Invalid("Tên tệp không hợp lệ.");
        return name;
    }

    private static bool IsZip(string fileName) => fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase);

    private static ValidationException Invalid(string message) => new([new ValidationFailure("files", message)]);
}
