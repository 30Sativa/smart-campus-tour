using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CorrectRosterEmailRequest(Guid RequestId, string Email, string ExpectedRowVersion,
    string ExpectedTourRowVersion, string ExpectedRosterRowVersion, string? ExpectedInvitationRowVersion = null);
