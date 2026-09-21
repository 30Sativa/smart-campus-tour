using System.Net;

namespace SmartCampus.Api.Hubs;

public static class SimulationPreviewAccess
{
    public static bool IsLoopback(IPAddress? address) => address is not null &&
        IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address);

    public static bool IsAllowed(bool enabled, bool development, bool ingestion, IPAddress? address) =>
        enabled && development && (!ingestion || IsLoopback(address));
}
