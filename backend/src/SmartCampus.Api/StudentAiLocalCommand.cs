using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Integrations.Invitations;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Api;

internal sealed class StudentAiLocalSetupException(string message) : Exception(message);

/// <summary>Explicit local browser test fixture; never changes the configured product database.</summary>
internal static class StudentAiLocalCommand
{
    public const string Argument = "--student-ai-local";

    public static async Task PrepareAsync(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment())
            throw new StudentAiLocalSetupException("Student AI local setup requires Development.");
        var connection = new SqlConnectionStringBuilder(
            builder.Configuration.GetConnectionString("DefaultConnection"));
        var host = connection.DataSource.Split(',')[0].Split('\\')[0].ToLowerInvariant();
        if (host is not ("localhost" or "127.0.0.1" or "." or "(local)" or "(localdb)"))
            throw new StudentAiLocalSetupException("Student AI local setup requires a local SQL Server.");
        var serviceKey = builder.Configuration["AiAssistant:ServiceKey"];
        if (string.IsNullOrWhiteSpace(serviceKey) || serviceKey.Length < 16)
            throw new StudentAiLocalSetupException("Configure AiAssistant:ServiceKey before local setup.");

        // The database name is generated here, never supplied by a caller or taken from product config.
        var database = "SmartCampusStudentAiLocal_" + Guid.NewGuid().ToString("N");
        connection.InitialCatalog = "master";
        await using (var master = new SqlConnection(connection.ConnectionString))
        {
            await master.OpenAsync();
            await using var create = new SqlCommand($"CREATE DATABASE [{database}]", master);
            await create.ExecuteNonQueryAsync();
        }
        connection.InitialCatalog = database;
        var backendRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../.."));
        var schema = await File.ReadAllTextAsync(Path.Combine(backendRoot, "database/smart-campus-tour-schema-v1.1.sql"));
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

        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
            ["Invitations:Enabled"] = "true",
            ["Invitations:HashKey"] = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)),
            ["Invitations:ProtectionKey"] = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)),
            ["Invitations:PublicBaseUrl"] = "https://localhost:5174",
            ["Invitations:SupportEmail"] = "support@example.test",
            ["Invitations:EmailWorkerEnabled"] = "false",
            ["Resend:ApiKey"] = "local-test-disabled-email-worker",
            ["Resend:From"] = "CampusTour <noreply@example.test>",
            ["Authentication:Jwt:SigningKey"] = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)),
            ["AiAssistant:BaseUrl"] = builder.Configuration["AiAssistant:BaseUrl"] ?? "http://127.0.0.1:8091",
            ["AiAssistant:ServiceKey"] = serviceKey,
            ["Cors:AllowedOrigins:0"] = "http://localhost:5173",
            ["Cors:AllowedOrigins:1"] = "http://127.0.0.1:5173",
            ["Cors:AllowedOrigins:2"] = "http://localhost:5174",
            ["Cors:AllowedOrigins:3"] = "http://127.0.0.1:5174"
        };
        builder.Configuration.AddInMemoryCollection(values);
        var codes = new InvitationCodeService(new InvitationConfiguration(builder.Configuration));
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(connection.ConnectionString).Options);
        var now = DateTimeOffset.UtcNow;
        var owner = new User { Id = Guid.NewGuid(), Username = "local-fixture-disabled", NormalizedUsername = "LOCAL-FIXTURE-DISABLED",
            PasswordHash = "disabled", FullName = "Local AI fixture", IsActive = false, CreatedAt = now };
        var route = new SmartCampus.Domain.Entities.Route { Id = Guid.NewGuid(), Name = "Local Q&A fixture",
            MapKey = "local-qa", MapFrame = "map", EndMode = "LAST_POI", IsActive = false, CreatedAt = now };
        // Route data only, so the invited page has stops to show; no progress or robot state is written.
        Poi Stop(string name, string description, string narration) => new() { Id = Guid.NewGuid(), Name = name,
            Description = description, NarrationText = narration, MapKey = route.MapKey, MapFrame = route.MapFrame,
            X = 0m, Y = 0m, Yaw = 0m, IsActive = false, CreatedAt = now };
        Poi[] pois =
        [
            Stop("[TEST] Sảnh chính", "Điểm thử cục bộ, nội dung chưa được duyệt.", "Đây là điểm thử đầu tiên của Tour cục bộ."),
            Stop("[TEST] Phòng thí nghiệm", "Điểm thử cục bộ, nội dung chưa được duyệt.", "Đây là điểm thử thứ hai của Tour cục bộ."),
            Stop("[TEST] Thư viện", "Điểm thử cục bộ, nội dung chưa được duyệt.", "Đây là điểm thử cuối của Tour cục bộ."),
        ];
        var stops = pois.Select((poi, index) => new RouteStop { Id = Guid.NewGuid(), RouteId = route.Id, PoiId = poi.Id,
            StopOrder = index + 1, DwellSeconds = 60, HeadStepsJson = "[]" }).ToList();
        var tour = new Tour { Id = Guid.NewGuid(), Name = "TEST CUC BO - AI Gemini",
            Description = "Local Q&A fixture only; three test stops, no robot, dispatch, livestream or progress.",
            RouteId = route.Id, ActiveRouteId = route.Id, State = "RUNNING", ScheduledStartAt = now,
            StartedAt = now, CreatedByUserId = owner.Id, CreatedAt = now };
        var registration = new GroupRegistration { Id = Guid.NewGuid(), TourId = tour.Id, RepresentativeUserId = owner.Id,
            SchoolName = "Local test", GroupName = "AI browser test", ContactName = "Test viewer", ContactEmail = "viewer@example.test",
            State = "APPROVED", ReviewedByUserId = owner.Id, ReviewedAt = now, SubmittedAt = now, CreatedAt = now };
        var row = new RosterRow { Id = Guid.NewGuid(), RegistrationId = registration.Id, RowNumber = 1,
            RowType = "INDIVIDUAL", DisplayName = "Test viewer", Email = "viewer@example.test", IsActive = true, CreatedAt = now };
        var invitationId = Guid.NewGuid();
        var code = codes.Create(invitationId, 1);
        var invitation = new Invitation { Id = invitationId, RosterRowId = row.Id, AccessVersion = 1,
            AccessCodeHash = code.Hash, AccessCodeProtected = code.Protected, CodeIssuedAt = now,
            ExpiresAt = now.AddHours(24), CreatedAt = now };
        db.Users.Add(owner);
        db.Routes.Add(route);
        db.Pois.AddRange(pois);
        db.RouteStops.AddRange(stops);
        db.Tours.Add(tour);
        db.GroupRegistrations.Add(registration);
        db.RosterRows.Add(row);
        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        // An ignored local file gives the human the entry code without putting credentials in logs.
        var ticket = Path.Combine(backendRoot, "student-ai-local.env");
        var lines = values.Select(pair => $"{pair.Key.Replace(":", "__")}={pair.Value}").ToList();
        await File.WriteAllLinesAsync(ticket, lines);
        await File.WriteAllLinesAsync(Path.Combine(backendRoot, "student-ai-entry.env"),
            [$"STUDENT_TOUR_URL=http://localhost:5174/tour/{tour.Id:D}",
             $"STUDENT_ACCESS_CODE={codes.Reveal(invitationId, 1, code.Protected)}"]);
        Console.WriteLine($"Local AI fixture created in {database}; expires in 24 hours. Email worker disabled.");
        Console.WriteLine($"Student page: http://localhost:5174/tour/{tour.Id:D}");
        Console.WriteLine("Entry code: backend/student-ai-entry.env; restart settings: backend/student-ai-local.env (ignored by Git).");
    }
}
