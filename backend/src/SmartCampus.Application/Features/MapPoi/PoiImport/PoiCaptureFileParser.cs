using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using YamlDotNet.Core;
using YamlDotNet.Core.Events;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record PoiCaptureQuaternion(decimal X, decimal Y, decimal Z, decimal W)
{
    public double Yaw => Math.Atan2(
        2d * (double)((W * Z) + (X * Y)),
        (double)((W * W) + (X * X) - (Y * Y) - (Z * Z)));
}

public sealed record PoiCaptureFile(
    string Id, string Name, string MapYaml, string FrameId,
    decimal X, decimal Y, decimal Yaw, PoiCaptureQuaternion? Quaternion, bool Verified);

public sealed class PoiCaptureFileException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>
/// Reads the robot's pose-capture YAML from the event stream, so only plain mappings
/// and scalars are ever materialized: tags, anchors, aliases and merge keys never apply.
/// </summary>
public static partial class PoiCaptureFileParser
{
    public const int MaxFileBytes = 64 * 1024;
    private const int MaxDepth = 4;
    private const int MaxNameLength = 150;
    private const int MaxFileNameLength = 255;

    private static readonly string[] TopLevelKeys = ["id", "name", "map_yaml", "frame_id", "pose", "verified"];
    private static readonly string[] PoseKeys = ["x", "y", "yaw", "quaternion"];
    private static readonly string[] QuaternionKeys = ["x", "y", "z", "w"];

    public static PoiCaptureFile Parse(byte[] content)
    {
        var root = ReadDocument(content);
        EnsureOnlyKnownKeys(root, TopLevelKeys, string.Empty);

        var id = RequiredText(root, "id");
        if (!IdPattern().IsMatch(id))
            throw Error("INVALID_ID", "id chỉ gồm chữ, số, '_' hoặc '-', tối đa 64 ký tự.");
        var name = RequiredText(root, "name").Trim();
        if (name.Length is 0 or > MaxNameLength)
            throw Error("INVALID_FIELD", $"name không được trống và tối đa {MaxNameLength} ký tự.");
        var mapYaml = RequiredText(root, "map_yaml").Trim();
        if (mapYaml.Length is 0 or > MaxFileNameLength)
            throw Error("INVALID_FIELD", "map_yaml không hợp lệ.");
        var frameId = RequiredText(root, "frame_id").Trim();
        if (frameId.Length == 0) throw Error("INVALID_FIELD", "frame_id không được trống.");

        var pose = RequiredMapping(root, "pose");
        EnsureOnlyKnownKeys(pose, PoseKeys, "pose.");
        var x = Number(pose, "x", "pose.x");
        var y = Number(pose, "y", "pose.y");
        var yaw = Number(pose, "yaw", "pose.yaw");
        var quaternion = ReadQuaternion(pose);

        return new PoiCaptureFile(id, name, mapYaml, frameId, x, y, yaw, quaternion, Boolean(root, "verified"));
    }

    private static Dictionary<string, object> ReadDocument(byte[] content)
    {
        string text;
        try
        {
            text = new UTF8Encoding(false, true).GetString(content).TrimStart('﻿');
        }
        catch (DecoderFallbackException)
        {
            throw Error("INVALID_YAML", "Tệp không phải văn bản UTF-8 hợp lệ.");
        }

        try
        {
            var parser = new Parser(new StringReader(text));
            Expect<StreamStart>(parser);
            if (parser.Current is not DocumentStart) throw Error("INVALID_YAML", "Tệp không có nội dung YAML.");
            Expect<DocumentStart>(parser);
            if (ReadNode(parser, 1) is not Dictionary<string, object> root)
                throw Error("INVALID_YAML", "Nội dung YAML phải là một mapping.");
            Expect<DocumentEnd>(parser);
            if (parser.Current is not StreamEnd) throw Error("INVALID_YAML", "Mỗi tệp chỉ được chứa một tài liệu YAML.");
            return root;
        }
        catch (YamlException)
        {
            throw Error("INVALID_YAML", "Tệp không đúng cú pháp YAML.");
        }
    }

    private static object ReadNode(Parser parser, int depth)
    {
        if (depth > MaxDepth) throw Error("INVALID_YAML", "Cấu trúc YAML lồng quá sâu.");
        switch (parser.Current)
        {
            case Scalar scalar:
                EnsurePlainNode(scalar);
                parser.MoveNext();
                return scalar;
            case MappingStart mapping:
                EnsurePlainNode(mapping);
                parser.MoveNext();
                var values = new Dictionary<string, object>(StringComparer.Ordinal);
                while (parser.Current is not MappingEnd)
                {
                    if (parser.Current is not Scalar key) throw Error("INVALID_YAML", "Khóa YAML phải là chuỗi.");
                    EnsurePlainNode(key);
                    parser.MoveNext();
                    if (values.ContainsKey(key.Value)) throw Error("DUPLICATE_KEY", $"Khóa '{key.Value}' bị lặp.");
                    values[key.Value] = ReadNode(parser, depth + 1);
                }
                parser.MoveNext();
                return values;
            default:
                throw Error("INVALID_YAML", "Tệp dùng alias, danh sách hoặc cấu trúc YAML không được hỗ trợ.");
        }
    }

    private static void EnsurePlainNode(NodeEvent node)
    {
        if (!node.Anchor.IsEmpty || !node.Tag.IsEmpty)
            throw Error("INVALID_YAML", "Tệp không được dùng anchor hoặc tag YAML.");
    }

    private static void Expect<T>(Parser parser) where T : ParsingEvent
    {
        if (parser.Current is not T) parser.MoveNext();
        if (parser.Current is not T) throw Error("INVALID_YAML", "Tệp không đúng cấu trúc YAML.");
        parser.MoveNext();
    }

    private static PoiCaptureQuaternion? ReadQuaternion(Dictionary<string, object> pose)
    {
        if (!pose.ContainsKey("quaternion")) return null;
        var values = RequiredMapping(pose, "quaternion");
        EnsureOnlyKnownKeys(values, QuaternionKeys, "pose.quaternion.");
        var quaternion = new PoiCaptureQuaternion(
            Number(values, "x", "pose.quaternion.x"), Number(values, "y", "pose.quaternion.y"),
            Number(values, "z", "pose.quaternion.z"), Number(values, "w", "pose.quaternion.w"));
        return quaternion is { X: 0, Y: 0, Z: 0, W: 0 }
            ? throw Error("INVALID_FIELD", "pose.quaternion không được toàn số 0.")
            : quaternion;
    }

    private static void EnsureOnlyKnownKeys(Dictionary<string, object> values, string[] allowed, string prefix)
    {
        var unknown = values.Keys.FirstOrDefault(key => !allowed.Contains(key, StringComparer.Ordinal));
        if (unknown is not null) throw Error("UNKNOWN_FIELD", $"Trường '{prefix}{unknown}' không được hỗ trợ.");
    }

    private static string RequiredText(Dictionary<string, object> values, string key)
    {
        if (!values.TryGetValue(key, out var value)) throw Missing(key);
        return value is Scalar scalar
            ? scalar.Value
            : throw Error("INVALID_FIELD", $"{key} phải là chuỗi.");
    }

    private static Dictionary<string, object> RequiredMapping(Dictionary<string, object> values, string key)
    {
        if (!values.TryGetValue(key, out var value)) throw Missing(key);
        return value as Dictionary<string, object> ?? throw Error("INVALID_FIELD", $"{key} phải là mapping.");
    }

    private static decimal Number(Dictionary<string, object> values, string key, string label)
    {
        if (!values.TryGetValue(key, out var value)) throw Missing(label);
        if (value is Scalar { Style: ScalarStyle.Plain } scalar &&
            decimal.TryParse(scalar.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
            return number;
        throw Error("INVALID_FIELD", $"{label} phải là số.");
    }

    private static bool Boolean(Dictionary<string, object> values, string key)
    {
        if (!values.TryGetValue(key, out var value)) throw Missing(key);
        return value is Scalar { Style: ScalarStyle.Plain, Value: "true" or "false" } scalar
            ? scalar.Value == "true"
            : throw Error("INVALID_FIELD", $"{key} phải là true hoặc false.");
    }

    private static PoiCaptureFileException Missing(string label) => Error("MISSING_FIELD", $"Thiếu trường bắt buộc {label}.");

    private static PoiCaptureFileException Error(string code, string message) => new(code, message);

    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex IdPattern();
}
