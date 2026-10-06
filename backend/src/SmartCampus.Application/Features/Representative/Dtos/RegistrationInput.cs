using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.Representative.Dtos;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RegistrationInput(string SchoolName, string GroupName, string ContactName, string ContactEmail,
    string ExpectedTourRowVersion, IReadOnlyList<RosterInput> Roster);
