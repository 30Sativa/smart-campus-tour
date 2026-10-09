using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

public sealed record RegistrationActions(ActionGate Edit, ActionGate Resubmit, ActionGate Cancel);
