namespace SmartCampus.Infrastructure.Authentication.Seeding;

public sealed class InitialAdminSeedConflictException(string message)
    : InvalidOperationException(message);
