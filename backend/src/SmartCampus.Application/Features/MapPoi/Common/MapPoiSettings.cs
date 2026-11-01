namespace SmartCampus.Application.Features.MapPoi;

public sealed class MapPoiSettings
{
    public const decimal DefaultPoiClearanceMeters = 0.30m;
    private const decimal MaxPoiClearanceMeters = 5m;

    public MapPoiSettings(decimal? poiClearanceMeters)
    {
        PoiClearanceMeters = poiClearanceMeters ?? DefaultPoiClearanceMeters;
        if (PoiClearanceMeters is <= 0 or > MaxPoiClearanceMeters)
            throw new InvalidOperationException($"Maps:PoiClearanceMeters must be greater than 0 and at most {MaxPoiClearanceMeters}.");
    }

    public decimal PoiClearanceMeters { get; }
}
