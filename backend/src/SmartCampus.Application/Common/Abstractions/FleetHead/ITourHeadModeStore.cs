namespace SmartCampus.Application.Common.Abstractions.FleetHead;

/// <summary>
/// The Operator's head mode per Tour (AUTO or MANUAL). In memory per API instance like the head channel; a Tour nobody
/// set, or any Tour after an API restart, has <c>FleetHead:DefaultMode</c>.
/// </summary>
public interface ITourHeadModeStore
{
    string GetMode(Guid tourId);
    void SetMode(Guid tourId, string mode);
}
