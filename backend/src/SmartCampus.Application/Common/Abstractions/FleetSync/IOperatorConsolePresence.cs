namespace SmartCampus.Application.Common.Abstractions.FleetSync;

/// <summary>
/// Whether a Staff user's operator console is connected (SRS §7, Start preflight <c>operatorConsoleConnected</c>).
/// The Operations Hub does not track connections per user yet (ADR-0042 open decision 4).
/// </summary>
public interface IOperatorConsolePresence
{
    /// <summary>Null when there is no source to tell; the Start preflight then fails the check.</summary>
    bool? IsConnected(Guid userId);
}
