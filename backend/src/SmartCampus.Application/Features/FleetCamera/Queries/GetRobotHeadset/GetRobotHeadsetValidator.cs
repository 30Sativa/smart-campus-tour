using FluentValidation;

namespace SmartCampus.Application.Features.FleetCamera.Queries.GetRobotHeadset;

public sealed class GetRobotHeadsetValidator : AbstractValidator<GetRobotHeadset>
{
    public GetRobotHeadsetValidator() =>
        RuleFor(query => query.RobotCode)
            .NotEmpty()
            .MaximumLength(100)
            .Matches("^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$");
}
