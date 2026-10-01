namespace SmartCampus.Application.Common.Abstractions.Authentication;

public interface IPasswordHasher
{
    string Hash(string password);

    bool Verify(string password, string storedHash);
}
