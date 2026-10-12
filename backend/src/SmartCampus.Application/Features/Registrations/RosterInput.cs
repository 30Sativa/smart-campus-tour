using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.Registrations;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RosterInput(int RowNumber, string RowType, string DisplayName, string Email, string? ClassName);
