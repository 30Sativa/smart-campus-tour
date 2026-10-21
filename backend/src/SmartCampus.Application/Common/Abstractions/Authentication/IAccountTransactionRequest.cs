namespace SmartCampus.Application.Common.Abstractions.Authentication;

/// <summary>Uses the account transaction boundary, including read-only refresh validation.</summary>
public interface IAccountTransactionRequest
{
    bool RequiresAccountTransaction => true;
}
