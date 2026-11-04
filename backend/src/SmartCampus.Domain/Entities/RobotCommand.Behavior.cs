namespace SmartCampus.Domain.Entities;

/// <summary>Stored and wire values of <see cref="RobotCommand.Kind"/> (ADR-0042 §2).</summary>
public static class RobotCommandKinds
{
    public const string GoTo = "GoTo";
    public const string Cancel = "Cancel";
}

/// <summary>Stored values of <see cref="RobotCommand.State"/> (ADR-0042 §3).</summary>
public static class RobotCommandStates
{
    public const string Pending = "PENDING";
    public const string Delivered = "DELIVERED";
    public const string Accepted = "ACCEPTED";
    public const string Arrived = "ARRIVED";
    public const string Failed = "FAILED";
    public const string Cancelled = "CANCELLED";
    public const string Rejected = "REJECTED";
    public const string Expired = "EXPIRED";
    public const string Unknown = "UNKNOWN";
    public const string Reconciled = "RECONCILED";
}

public static class RobotLegKinds
{
    public const string ToPoi = "TO_POI";
    public const string ToEnd = "TO_END";
}

public partial class RobotCommand
{
    public static RobotCommand GoTo(Guid robotId, Guid tourId, Guid legId, string legKind, Guid? stopId, string mapKey, string frameId,
        decimal x, decimal y, decimal yaw, DateTimeOffset issuedAt, DateTimeOffset acceptBy, Guid? issuedByUserId)
    {
        var command = new RobotCommand
        {
            Id = Guid.NewGuid(), RobotId = robotId, TourId = tourId, LegId = legId, LegKind = legKind, Kind = RobotCommandKinds.GoTo,
            RouteRevisionStopId = stopId, MapKey = mapKey, FrameId = frameId, X = x, Y = y, Yaw = yaw,
            IssuedAt = issuedAt, AcceptBy = acceptBy, IssuedByUserId = issuedByUserId
        };
        command.MoveTo(RobotCommandStates.Pending);
        return command;
    }

    public void Accept(DateTimeOffset at)
    {
        AcceptedAt = at;
        MoveTo(RobotCommandStates.Accepted);
    }

    public void Reject(DateTimeOffset at, string? reason)
    {
        CompletedAt = at;
        ReasonCode = reason;
        MoveTo(RobotCommandStates.Rejected);
    }

    /// <summary>The real end of the leg: <paramref name="outcome"/> is ARRIVED, FAILED or CANCELLED.</summary>
    public void Finish(string outcome, DateTimeOffset at, string? reason)
    {
        CompletedAt = at;
        ReasonCode = reason;
        MoveTo(outcome);
    }

    /// <summary>The only writer of State, IsOpen and Outcome, so the three cannot disagree with the table's CHECKs.</summary>
    private void MoveTo(string state)
    {
        State = state;
        IsOpen = state is RobotCommandStates.Pending or RobotCommandStates.Delivered or RobotCommandStates.Accepted ||
            (state == RobotCommandStates.Unknown && Kind == RobotCommandKinds.GoTo);
        Outcome = state is RobotCommandStates.Arrived or RobotCommandStates.Failed or RobotCommandStates.Cancelled ? state : null;
    }
}
