using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.Representative.Dtos;

/// <summary>Body shared by the update and resubmit use cases: replacement details plus the opened draft version.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReplaceRegistrationRequest(RegistrationInput Input, string ExpectedRowVersion);
