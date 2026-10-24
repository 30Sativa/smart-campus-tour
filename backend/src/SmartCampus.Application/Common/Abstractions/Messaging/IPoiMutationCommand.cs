namespace SmartCampus.Application.Common.Abstractions.Messaging;

/// <summary>Marks POI changes that must check usage and commit under one SQL transaction.</summary>
public interface IPoiMutationCommand<out TResponse> : ICommand<TResponse>
{
}
