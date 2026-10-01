using System.Text.Json.Serialization;

namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateAccountRequest(
    string Username,
    string FullName,
    string Role,
    string InitialPassword);
