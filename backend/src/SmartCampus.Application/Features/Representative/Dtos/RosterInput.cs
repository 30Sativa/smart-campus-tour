using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.Representative.Dtos;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RosterInput(int RowNumber, string RowType, string DisplayName, string Email, string? ClassName);
