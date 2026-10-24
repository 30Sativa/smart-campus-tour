namespace SmartCampus.Application.Features.Representative;

/// <summary>Representative operations evaluated by <see cref="RepresentativeRegistrationPolicy"/>.</summary>
public enum RegistrationOperation
{
    Create,
    Update,
    Resubmit,
    Cancel
}
