namespace SmartCampus.Api;

internal sealed class InitialAdminSeedCommand
{
    private const string Command = "--seed-initial-admin";
    private readonly string[] hostArguments;

    private InitialAdminSeedCommand(bool requested, string[] hostArguments)
    {
        Requested = requested;
        this.hostArguments = hostArguments;
    }

    public bool Requested { get; }

    public static InitialAdminSeedCommand Parse(string[] args)
    {
        if (args.Any(IsInitialAdminSeedPasswordArgument))
        {
            throw new InvalidOperationException(
                "InitialAdminSeed:Password must be supplied through environment variables or User Secrets, not command-line arguments.");
        }

        var requested = args.Contains(Command, StringComparer.Ordinal);
        var hostArguments = args
            .Where(argument => !string.Equals(argument, Command, StringComparison.Ordinal))
            .ToArray();

        return new InitialAdminSeedCommand(requested, hostArguments);
    }

    public string[] GetHostArguments() => hostArguments;

    private static bool IsInitialAdminSeedPasswordArgument(string argument)
    {
        var key = argument.TrimStart('-', '/').Split('=', 2)[0].Replace("__", ":", StringComparison.Ordinal);
        return string.Equals(key, "InitialAdminSeed:Password", StringComparison.OrdinalIgnoreCase);
    }
}
