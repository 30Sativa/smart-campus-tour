using System.Text.Json;
using Microsoft.Extensions.Configuration;
using SmartCampus.Infrastructure.Integrations.FleetSync;

namespace SmartCampus.Api;

internal sealed record FleetRobotProvisionArguments(
    bool Requested,
    string? RobotCode,
    string[] HostArguments,
    string? Error);

internal static class FleetRobotProvisionCommand
{
    public const string Argument = "--provision-fleet-robot";

    public static FleetRobotProvisionArguments Parse(string[] args)
    {
        var index = Array.FindIndex(args, value => string.Equals(value, Argument, StringComparison.Ordinal));
        if (index < 0)
            return new FleetRobotProvisionArguments(false, null, args, null);

        if (Array.FindIndex(args, index + 1, value => string.Equals(value, Argument, StringComparison.Ordinal)) >= 0)
            return new FleetRobotProvisionArguments(true, null, [], $"Use {Argument} once.");

        if (index + 1 >= args.Length ||
            !System.Text.RegularExpressions.Regex.IsMatch(args[index + 1], "^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$"))
            return new FleetRobotProvisionArguments(true, null, [], $"Usage: {Argument} <existing-robot-code>");

        var hostArguments = args.Where((_, argumentIndex) => argumentIndex != index && argumentIndex != index + 1).ToArray();
        if (hostArguments.Length > 0)
            return new FleetRobotProvisionArguments(true, null, [], "Fleet credential provisioning must run by itself.");

        return new FleetRobotProvisionArguments(true, args[index + 1], [], null);
    }

    public static async Task<int> RunAsync(IConfiguration configuration, string robotCode)
    {
        var connectionString = configuration["FleetProvisioning:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.Error.WriteLine("FleetProvisioning:ConnectionString is required for this one-shot command.");
            return 2;
        }

        try
        {
            var result = await new FleetRobotCredentialProvisioner()
                .ProvisionAsync(connectionString, robotCode);
            if (result is null)
            {
                Console.Error.WriteLine("Physical robot was not found or already has a credential; no credential was changed. Rotate explicitly through the TechnicalStaff API.");
                return 1;
            }

            Console.WriteLine(JsonSerializer.Serialize(result));
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Fleet credential provisioning failed ({exception.GetType().Name}).");
            return 1;
        }
    }
}
