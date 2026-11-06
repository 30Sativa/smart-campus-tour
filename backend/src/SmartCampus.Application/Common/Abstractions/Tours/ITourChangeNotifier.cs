namespace SmartCampus.Application.Common.Abstractions.Tours;

/// <summary>
/// Told after a Tour command has committed, so Staff screens can re-read Tours instead of waiting for their next poll.
/// A hint only: it carries no state, may be coalesced or lost, and is never the source of truth (the Tour API is).
/// </summary>
public interface ITourChangeNotifier
{
    void TourChanged();
}

/// <summary>The default when no realtime channel is hosted (tests, tools): nothing is told, screens keep polling.</summary>
public sealed class NoTourChangeNotifier : ITourChangeNotifier
{
    public void TourChanged() { }
}
