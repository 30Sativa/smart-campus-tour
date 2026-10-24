using System.Text.RegularExpressions;

namespace SmartCampus.Application.Features.Registrations;

/// <summary>Email rules shared by registration input, storage and the Tour-wide reservation key.</summary>
public static class RegistrationEmail
{
    /// <summary>Stored value and reservation key: trimmed and case-insensitive, without alias canonicalization.</summary>
    public static string Normalize(string email) => email.Trim().ToLowerInvariant();

    public static bool IsValid(string? email) => email is not null && Regex.IsMatch(email.Trim(), @"^[^\s@]+@[^\s@]+$");
}
