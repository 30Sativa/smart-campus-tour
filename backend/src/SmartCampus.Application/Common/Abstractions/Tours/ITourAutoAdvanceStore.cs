namespace SmartCampus.Application.Common.Abstractions.Tours;

/// <summary>
/// The Operator's "leave a POI by itself when its dwell ends" switch per Tour, off by default. In memory per API instance,
/// like the head mode: after a restart every Tour is manual again, which is the safe side. Each POI visit gets at most
/// one automatic attempt; a blocked attempt is remembered for that visit so the console can say why it did not leave.
/// </summary>
public interface ITourAutoAdvanceStore
{
    bool IsEnabled(Guid tourId);
    void Set(Guid tourId, bool enabled);
    IReadOnlyCollection<Guid> EnabledTours();
    /// <summary>True only the first time for this visit.</summary>
    bool TryClaim(Guid visitId);
    void SetBlocked(Guid tourId, Guid visitId, string reason);
    /// <summary>Why the automatic attempt for this visit did not leave, or null.</summary>
    string? BlockedReason(Guid tourId, Guid? visitId);
}
