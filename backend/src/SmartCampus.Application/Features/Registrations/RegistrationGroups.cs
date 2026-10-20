namespace SmartCampus.Application.Features.Registrations;

/// <summary>
/// How "Đăng ký của tôi" splits a Representative's registrations. A registration is CLOSED when it was
/// cancelled, its Tour was cancelled, or it was refused after the Tour stopped taking changes (no resubmit is
/// possible); everything else is ACTIVE. The repository applies the same rule in SQL.
/// </summary>
public static class RegistrationGroups
{
    public const string Active = "active";
    public const string Closed = "closed";

    public static bool IsKnown(string? group) => group is Active or Closed;
}
