namespace SmartCampus.Application.Common.Exceptions;

/// <summary>One failed precondition of a checklist conflict, such as a READY blocker.</summary>
public sealed record ConflictBlocker(string Code, string Message);

/// <summary>One row of a full checklist returned with a conflict, such as a Start check (ADR-0042).</summary>
public sealed record ConflictCheck(string Id, bool Passed, string Source, string Detail);

public sealed class ConflictException : Exception
{
    public ConflictException(string message, string code = "CONFLICT",
        IReadOnlyDictionary<string, string[]>? fieldErrors = null, IReadOnlyList<ConflictBlocker>? blockers = null,
        IReadOnlyList<ConflictCheck>? checks = null, IReadOnlyList<string>? blockedBy = null)
        : base(message)
    {
        Code = code;
        FieldErrors = fieldErrors;
        Blockers = blockers;
        Checks = checks;
        BlockedBy = blockedBy;
    }

    public string Code { get; }
    public IReadOnlyDictionary<string, string[]>? FieldErrors { get; }
    /// <summary>Every failed precondition, not only the first; null for an ordinary conflict.</summary>
    public IReadOnlyList<ConflictBlocker>? Blockers { get; }
    /// <summary>The whole checklist, passed rows included; null for an ordinary conflict.</summary>
    public IReadOnlyList<ConflictCheck>? Checks { get; }
    /// <summary>Ids of the failing root-cause checks; a check skipped because another failed is not listed.</summary>
    public IReadOnlyList<string>? BlockedBy { get; }
}
