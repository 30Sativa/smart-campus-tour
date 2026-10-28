using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative;

/// <summary>
/// What a Representative may do with an owned registration. Commands enforce the decision under the Tour
/// lock; queries project the same decision as client-facing action gates.
/// </summary>
public static class RepresentativeRegistrationPolicy
{
    public static RegistrationGate Evaluate(string tourState, string registrationState, bool hasInvitations,
        RegistrationOperation operation)
    {
        if (!RegistrationGate.IsTourOpen(tourState))
            return RegistrationGate.TourLocked;
        if (operation == RegistrationOperation.Create)
            return RegistrationGate.Open;
        var allowed = operation switch
        {
            RegistrationOperation.Update => registrationState is RegistrationStates.Submitted or RegistrationStates.Approved,
            RegistrationOperation.Resubmit => registrationState is RegistrationStates.Rejected or RegistrationStates.Cancelled,
            RegistrationOperation.Cancel => registrationState is RegistrationStates.Submitted or RegistrationStates.Rejected or RegistrationStates.Approved,
            _ => false
        };
        return allowed
            ? RegistrationGate.Open
            : RegistrationGate.Refuse(RegistrationGate.StateConflictCode, "Trạng thái đăng ký không cho phép thao tác này.");
    }
}
