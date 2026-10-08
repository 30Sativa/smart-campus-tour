using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.RegistrationReview.Commands;

/// <summary>Body of both decisions: versions of the snapshot the Admin opened and, for rejection only, a reason.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReviewRequest(string ExpectedRowVersion, string ExpectedTourRowVersion, string? Reason = null);
