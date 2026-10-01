using System.Text.Json.Serialization;

namespace SmartCampus.Api.Features.Accounts.Requests;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateAccountRequest(
    string Username,
    string FullName,
    string Role,
    string InitialPassword);
