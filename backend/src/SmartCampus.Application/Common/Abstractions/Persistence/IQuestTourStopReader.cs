namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Where the Tour RUNNING on a robot is, for the MC character in the robot's Quest headset. <see cref="StopId"/> and the
/// stop fields name the stop the Tour is at (OBSERVING) or driving to (NAVIGATING); null while it returns to the end or
/// waits at the start. <see cref="NarrationText"/> is the same snapshot the Student page reads (the route revision's
/// approved narration, ADR-0060), so the headset and the Student page never say different things.
/// </summary>
public sealed record QuestTourStopFacts(
    Guid TourId,
    string? Step,
    bool IsHeld,
    Guid? VisitId,
    Guid? StopId,
    int? StopOrder,
    string? StopName,
    string? NarrationText);

public interface IQuestTourStopReader
{
    /// <summary>Null when no Tour is RUNNING on the active robot with this code.</summary>
    Task<QuestTourStopFacts?> GetRunningAsync(string robotCode, CancellationToken cancellationToken);
}
