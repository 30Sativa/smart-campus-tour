namespace SmartCampus.Application.Common.Exceptions;

public sealed class ConflictException : Exception
{
    public ConflictException(string message, string code = "CONFLICT",
        IReadOnlyDictionary<string, string[]>? fieldErrors = null)
        : base(message)
    {
        Code = code;
        FieldErrors = fieldErrors;
    }

    public string Code { get; }
    public IReadOnlyDictionary<string, string[]>? FieldErrors { get; }
}
