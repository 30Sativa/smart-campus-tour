using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReviewRequest(string ExpectedRowVersion, string ExpectedTourRowVersion, string? Reason = null);
