using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Integrations.Invitations;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Api;

/// <summary>Explicit Development fixture for registration through the real HTTP workflow.</summary>
internal static class RegistrationLocalCommand
{
    public const string Argument = "--registration-local";

    public static async Task PrepareAsync(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment())
            throw new StudentAiLocalSetupException("Registration local setup requires Development.");
        var connection = new SqlConnectionStringBuilder(builder.Configuration.GetConnectionString("DefaultConnection"));
        var host = connection.DataSource.Split(',')[0].Split('\\')[0].ToLowerInvariant();
        if (host is not ("localhost" or "127.0.0.1" or "." or "(local)" or "(localdb)"))
            throw new StudentAiLocalSetupException("Registration local setup requires a local SQL Server.");
        if (string.IsNullOrWhiteSpace(builder.Configuration["Resend:ApiKey"]) ||
            string.IsNullOrWhiteSpace(builder.Configuration["Resend:From"]))
            throw new StudentAiLocalSetupException("Configure Resend:ApiKey and Resend:From before local setup.");

        var values = new Dictionary<string, string?>
        {
            ["Invitations:Enabled"] = "true",
            ["Invitations:HashKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            ["Invitations:ProtectionKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            ["Invitations:PublicBaseUrl"] = "https://localhost:5175",
            ["Invitations:SupportEmail"] = builder.Configuration["Invitations:SupportEmail"] ?? "support@example.test",
            ["Invitations:EmailWorkerEnabled"] = "true",
            ["Authentication:Jwt:SigningKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)),
            ["Cors:AllowedOrigins:0"] = "https://localhost:5175",
            ["Logging:LogLevel:Microsoft.EntityFrameworkCore.Database.Command"] = "Warning"
        };
        builder.Configuration.AddInMemoryCollection(values);
        _ = new InvitationConfiguration(builder.Configuration);
        var backendRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../.."));
        var schema = await File.ReadAllTextAsync(Path.Combine(backendRoot, "database/smart-campus-tour-schema-v1.1.sql"));
        var database = "SmartCampusRegistrationLocal_" + Guid.NewGuid().ToString("N");
        connection.InitialCatalog = "master";
        await using (var master = new SqlConnection(connection.ConnectionString))
        {
            await master.OpenAsync();
            await using var create = new SqlCommand($"CREATE DATABASE [{database}]", master);
            await create.ExecuteNonQueryAsync();
        }
        connection.InitialCatalog = database;
        await using (var sql = new SqlConnection(connection.ConnectionString))
        {
            await sql.OpenAsync();
            foreach (var batch in Regex.Split(schema, @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(batch)) continue;
                await using var command = new SqlCommand(batch, sql);
                await command.ExecuteNonQueryAsync();
            }
        }
        values["ConnectionStrings:DefaultConnection"] = connection.ConnectionString;
        builder.Configuration.AddInMemoryCollection(values);
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(connection.ConnectionString).Options);
        var now = DateTimeOffset.UtcNow;
        var hasher = new IdentityPasswordHasher();
        var adminPassword = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)) + "a!";
        var repPassword = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)) + "a!";
        var admin = new User { Id = Guid.NewGuid(), Username = "happy-admin", NormalizedUsername = "HAPPY-ADMIN",
            PasswordHash = hasher.Hash(adminPassword), FullName = "Admin test local", IsActive = true, CreatedAt = now };
        var rep = new User { Id = Guid.NewGuid(), Username = "happy-rep", NormalizedUsername = "HAPPY-REP",
            PasswordHash = hasher.Hash(repPassword), FullName = "Representative test local", IsActive = true, CreatedAt = now };
        var route = new SmartCampus.Domain.Entities.Route { Id = Guid.NewGuid(), Name = "Local registration test",
            MapKey = "local-registration", MapFrame = "map", EndMode = "LAST_POI", IsActive = false, CreatedAt = now };
        var tour = new Tour { Id = Guid.NewGuid(), Name = "TEST LOCAL - Dang ky va Gmail",
            Description = "Local registration/email workflow only; no robot dispatch.", RouteId = route.Id, ActiveRouteId = route.Id,
            State = "SCHEDULED", ScheduledStartAt = now.AddHours(2), CreatedByUserId = admin.Id, CreatedAt = now };
        db.Users.AddRange(admin, rep);
        db.UserRoles.AddRange(new UserRole { UserId = admin.Id, Role = ApplicationRoles.AdminCode },
            new UserRole { UserId = rep.Id, Role = ApplicationRoles.RepresentativeCode });
        db.Routes.Add(route);
        db.Tours.Add(tour);
        await db.SaveChangesAsync();
        await File.WriteAllLinesAsync(Path.Combine(backendRoot, "registration-local.env"),
            values.Select(pair => $"{pair.Key.Replace(":", "__")}={pair.Value}"));
        await File.WriteAllLinesAsync(Path.Combine(backendRoot, "registration-entry.env"),
            [$"TOUR_ID={tour.Id:D}", "WEB_URL=https://localhost:5175", "ADMIN_USERNAME=happy-admin",
             $"ADMIN_PASSWORD={adminPassword}", "REP_USERNAME=happy-rep", $"REP_PASSWORD={repPassword}"]);
        Console.WriteLine($"Registration fixture created in {database}. No registration or invitation has been seeded.");
        Console.WriteLine("Test login details: backend/registration-entry.env (ignored by Git). Real email worker enabled.");
    }
}
