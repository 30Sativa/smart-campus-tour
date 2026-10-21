namespace SmartCampus.Application.Common.Authentication;

/// <summary>Policy for newly set account passwords. Login still accepts existing shorter passwords.</summary>
public static class AccountPasswordPolicy
{
    public const int MinimumLength = 12;
    public const int MaximumLength = 128;

    public static bool IsValid(string? password) =>
        !string.IsNullOrWhiteSpace(password) && password.Length is >= MinimumLength and <= MaximumLength;
}
