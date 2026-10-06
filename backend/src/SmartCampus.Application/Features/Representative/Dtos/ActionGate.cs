namespace SmartCampus.Application.Features.Representative.Dtos;

public sealed record ActionGate(bool Allowed, string? Reason = null);
