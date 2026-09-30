namespace SmartCampus.Application.Common.Abstractions.Authentication;

public interface IUsernameNormalizer
{
    string Normalize(string username);
}
