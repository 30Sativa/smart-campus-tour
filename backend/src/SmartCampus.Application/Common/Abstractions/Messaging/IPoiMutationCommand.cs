namespace SmartCampus.Application.Common.Abstractions.Messaging;

/// <summary>Marks versioned map/POI mutations that require one SQL transaction.</summary>
public interface IPoiMutationCommand<out TResponse> : ICommand<TResponse>
{
}
