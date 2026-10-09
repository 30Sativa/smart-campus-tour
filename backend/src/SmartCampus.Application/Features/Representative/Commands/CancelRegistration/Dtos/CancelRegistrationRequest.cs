using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.Representative.Commands.CancelRegistration.Dtos;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CancelRegistrationRequest(string ExpectedRowVersion, string ExpectedTourRowVersion);
