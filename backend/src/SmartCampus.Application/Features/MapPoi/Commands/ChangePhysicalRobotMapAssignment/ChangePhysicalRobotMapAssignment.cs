using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record AssignPhysicalRobotMapRequest(Guid RequestId, string ExpectedRowVersion, Guid MapVersionId);
public sealed record ClearPhysicalRobotMapRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record RobotMapAssignmentView(Guid Id, string RobotCode, Guid? AssignedMapVersionId,
    string? AssignedAreaName, int? AssignedVersionNumber, string? AssignedMapKey, string? AssignedFrameId,
    DateTimeOffset? MapAssignedAt, string? MapAssignedByName, string RowVersion,
    IReadOnlyList<RobotAffectedTour> AffectedTours);

public sealed record ChangePhysicalRobotMapAssignmentCommand(Guid RobotId, Guid ActorUserId, Guid RequestId,
    string ExpectedRowVersion, Guid? MapVersionId) : ICommand<RobotMapAssignmentView>;

public sealed class ChangePhysicalRobotMapAssignmentValidator : AbstractValidator<ChangePhysicalRobotMapAssignmentCommand>
{
    public ChangePhysicalRobotMapAssignmentValidator()
    {
        RuleFor(x => x.RobotId).NotEmpty();
        RuleFor(x => x.ActorUserId).NotEmpty();
        RuleFor(x => x.RequestId).NotEmpty();
        RuleFor(x => x.ExpectedRowVersion).Must(IsRowVersion)
            .WithMessage("ExpectedRowVersion must be a base64 SQL rowversion.");
        RuleFor(x => x.MapVersionId).Must(value => value is null || value != Guid.Empty);
    }

    private static bool IsRowVersion(string? value)
    {
        try { return Convert.FromBase64String(value ?? "") is { Length: 8 } bytes && Convert.ToBase64String(bytes) == value; }
        catch (FormatException) { return false; }
    }
}

public sealed class ChangePhysicalRobotMapAssignmentHandler(IRobotMapAssignmentManager manager)
    : IRequestHandler<ChangePhysicalRobotMapAssignmentCommand, RobotMapAssignmentView>
{
    public Task<RobotMapAssignmentView> Handle(ChangePhysicalRobotMapAssignmentCommand request, CancellationToken ct) =>
        manager.ChangeAsync(request.RobotId, request.ActorUserId, request.RequestId,
            request.ExpectedRowVersion, request.MapVersionId, ct);
}
