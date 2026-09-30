namespace SmartCampus.Infrastructure.Authentication;

public sealed class InitialAdminSeedConflictException(string message)
    : InvalidOperationException(message);
