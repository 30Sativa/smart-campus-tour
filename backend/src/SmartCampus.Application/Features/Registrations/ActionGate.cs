namespace SmartCampus.Application.Features.Registrations;

public sealed record ActionGate(bool Allowed, string? Reason = null);
