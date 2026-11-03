namespace SmartCampus.Application.Common.Exceptions;

/// <summary>One failed precondition of a checklist conflict, such as a READY blocker.</summary>
public sealed record ConflictBlocker(string Code, string Message);

public sealed class ConflictException : Exception
{
    public ConflictException(string message, string code = "CONFLICT",
        IReadOnlyDictionary<string, string[]>? fieldErrors = null, IReadOnlyList<ConflictBlocker>? blockers = null)
        : base(message)
    {
        Code = code;
        FieldErrors = fieldErrors;
        Blockers = blockers;
    }

    public string Code { get; }
    public IReadOnlyDictionary<string, string[]>? FieldErrors { get; }
    /// <summary>Every failed precondition, not only the first; null for an ordinary conflict.</summary>
    public IReadOnlyList<ConflictBlocker>? Blockers { get; }
}
