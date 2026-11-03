using SmartCampus.Application.Common.Abstractions.FleetSync;

namespace SmartCampus.Infrastructure.Integrations.FleetSync;

/// <summary>No per-user console tracking exists yet, so presence is never reported as connected (fail-closed).</summary>
public sealed class UnavailableOperatorConsolePresence : IOperatorConsolePresence
{
    public bool? IsConnected(Guid userId) => null;
}
