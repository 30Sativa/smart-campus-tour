using System.Text.Json;
using FluentValidation;
using FluentValidation.Results;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>ADR-0075 stage 2: the second of the fallback video at which the recording reaches one POI of the Tour's route.</summary>
public sealed record FallbackVideoMark(Guid RevisionStopId, int StartSeconds);

/// <summary>The marks as stored: they belong to the one fallback video they were set for.</summary>
public sealed record FallbackVideoMarksData(string VideoUrl, IReadOnlyList<FallbackVideoMark> Marks);

/// <summary>
/// ADR-0075 stage 2: Staff set, with the fallback video, where in it each POI starts. The marks are a
/// <see cref="TourLifecycleEvents.FallbackVideoMarksSet"/> event naming the video they belong to, so the newest event
/// counts only while that video is still the Tour's; a new video starts without marks. Who set them is its ActorUserId.
/// </summary>
public static class TourFallbackVideoMarks
{
    /// <summary>A recording longer than a day is not a Tour.</summary>
    public const int MaxSeconds = 86_400;
    public const int MaxMarks = 100;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Marks in the order the recording reaches them.</summary>
    public static IReadOnlyList<FallbackVideoMark>? Normalize(IReadOnlyList<FallbackVideoMark>? marks) =>
        marks?.OrderBy(m => m.StartSeconds).ThenBy(m => m.RevisionStopId).ToArray();

    /// <summary>The marks of the Tour's current video; none when the newest marks were set for another video.</summary>
    public static IReadOnlyList<FallbackVideoMark> For(FallbackVideoMarksData? stored, string? videoUrl) =>
        stored is not null && videoUrl is not null && stored.VideoUrl == videoUrl ? stored.Marks : [];

    public static FallbackVideoMarksData? Parse(string? dataJson) =>
        dataJson is null ? null : JsonSerializer.Deserialize<FallbackVideoMarksData>(dataJson, Json);

    public static bool Same(IReadOnlyList<FallbackVideoMark> a, IReadOnlyList<FallbackVideoMark> b) => a.SequenceEqual(b);

    /// <summary>Every mark names a stop of the Tour's route revision; a Tour without one takes no marks.</summary>
    public static async Task RequireStopsAsync(IRouteRevisionRepository revisions, Guid? revisionId,
        IReadOnlyList<FallbackVideoMark> marks, CancellationToken ct)
    {
        if (marks.Count == 0) return;
        var stops = revisionId is { } id ? (await revisions.GetStopsAsync(id, ct)).Select(s => s.Id).ToHashSet() : [];
        if (marks.Any(m => !stops.Contains(m.RevisionStopId)))
            throw new ValidationException([new ValidationFailure("Configuration.FallbackVideoMarks",
                "Mốc thời gian phải thuộc các điểm dừng trên tuyến của Tour.")]);
    }

    public static TourEvent Event(Guid tourId, string videoUrl, IReadOnlyList<FallbackVideoMark> marks, Guid actor, DateTimeOffset now) => new()
    {
        TourId = tourId, EventType = TourLifecycleEvents.FallbackVideoMarksSet, OccurredAt = now, ActorUserId = actor,
        DataJson = JsonSerializer.Serialize(new FallbackVideoMarksData(videoUrl, marks), Json)
    };
}

/// <summary>The rules a request's marks follow before the route is read.</summary>
public sealed class FallbackVideoMarksValidator : AbstractValidator<IReadOnlyList<FallbackVideoMark>>
{
    public FallbackVideoMarksValidator()
    {
        RuleFor(marks => marks.Count).LessThanOrEqualTo(TourFallbackVideoMarks.MaxMarks)
            .WithMessage($"Tối đa {TourFallbackVideoMarks.MaxMarks} mốc thời gian.");
        RuleFor(marks => marks).Must(marks => marks.Select(m => m.RevisionStopId).Distinct().Count() == marks.Count)
            .WithMessage("Mỗi điểm dừng chỉ có một mốc thời gian.");
        RuleForEach(marks => marks).ChildRules(mark =>
        {
            mark.RuleFor(m => m.RevisionStopId).NotEmpty();
            mark.RuleFor(m => m.StartSeconds).InclusiveBetween(0, TourFallbackVideoMarks.MaxSeconds)
                .WithMessage("Mốc thời gian phải nằm trong video.");
        });
    }
}
