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
    public const string LegEndedReason = "LEG_ENDED";

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

    /// <summary>A request to stop <paramref name="goTo"/>. A Cancel has no target and no AcceptBy, so undelivered it stays deliverable.</summary>
    public static RobotCommand CancelOf(RobotCommand goTo, DateTimeOffset issuedAt, Guid? issuedByUserId)
    {
        var command = new RobotCommand
        {
            Id = Guid.NewGuid(), RobotId = goTo.RobotId, TourId = goTo.TourId, LegId = goTo.LegId, LegKind = goTo.LegKind,
            Kind = RobotCommandKinds.Cancel, TargetCommandId = goTo.Id, IssuedAt = issuedAt, IssuedByUserId = issuedByUserId
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

    /// <summary>Only a PENDING command expires: this state proves the robot never received it.</summary>
    public void Expire(DateTimeOffset at, string reason)
    {
        CompletedAt = at;
        ReasonCode = reason;
        MoveTo(RobotCommandStates.Expired);
    }

    /// <summary>The robot may have started. An UNKNOWN GoTo stays open and blocks the robot.</summary>
    public void MarkUnknown(DateTimeOffset at, string reason)
    {
        CompletedAt = at;
        ReasonCode = reason;
        MoveTo(RobotCommandStates.Unknown);
    }

    /// <summary>Closes an UNKNOWN GoTo without inventing an outcome.</summary>
    public void Reconcile(Guid userId, string note, DateTimeOffset at)
    {
        ResolvedByUserId = userId;
        ResolvedAt = at;
        ResolutionNote = note;
        MoveTo(RobotCommandStates.Reconciled);
    }

    /// <summary>
    /// A Cancel whose GoTo has closed has nothing left to do. The table keeps an ACCEPTED Cancel open, so without this the
    /// robot could never be released. A delivered Cancel has no state that says "moot"; UNKNOWN closes it with this reason.
    /// </summary>
    public void CloseCancel(DateTimeOffset at)
    {
        if (State == RobotCommandStates.Pending) Expire(at, LegEndedReason);
        else MarkUnknown(at, LegEndedReason);
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
