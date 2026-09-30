using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace SmartCampus.IntegrationTests;

// Opt-in real SQL Server tests. Each test owns a new database; no existing DB is modified.
public sealed class SchemaV11FactAttribute : FactAttribute
{
    public SchemaV11FactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")))
            Skip = "Set SMARTCAMPUS_SCHEMA_TEST_CONNECTION to a disposable local SQL Server instance (CREATE DATABASE permission).";
    }
}

public sealed class SchemaV11Tests
{
    private static string Id(int value) => $"00000000-0000-0000-0000-{value:D12}";

    [SchemaV11Fact]
    public async Task BusinessKeys_RejectDuplicates_AllowDifferentRegistrationsAndRoutes()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Users SET NormalizedUsername=N'USER1' WHERE Id='{Id(2)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Robots SET RobotCode=N'robot_1' WHERE Id='{Id(82)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.RouteStops SET StopOrder=1 WHERE Id='{Id(24)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.TourAllowedBranches SET RouteVariantId='{Id(31)}' WHERE Id='{Id(52)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Invitations SET RosterRowId='{Id(61)}' WHERE Id='{Id(72)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.Invitations SET AccessCodeHash=CONVERT(binary(32),1) WHERE Id='{Id(72)}';");
        await db.ExpectErrorAsync(2627, $"UPDATE dbo.RefreshTokens SET TokenHash=CONVERT(binary(32),1) WHERE Id='{Id(92)}';");
        await db.ExecuteAsync(SessionInsert(101, 71, 1, closed: true));
        await db.ExpectErrorAsync(2627, SessionInsert(102, 72, 1));

        // The fixture deliberately has two registrations by the same representative for one Tour,
        // and StopOrder=1 in three different routes. No accidental global uniqueness is allowed.
        Assert.Equal(2, await db.ScalarAsync<int>($"SELECT COUNT(*) FROM dbo.GroupRegistrations WHERE TourId='{Id(41)}' AND RepresentativeUserId='{Id(1)}';"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.RouteStops WHERE StopOrder=1;"));
        Assert.Equal(17, await db.ScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0;"));
    }

    [SchemaV11Fact]
    public async Task Sessions_ConcurrentAdmissionHasOneWinner_ExpiredRowMustBeClosed()
    {
        await using var db = await TestDatabase.CreateAsync();
        // Independent connections race the actual SQL index, not an in-memory substitute.
        var outcomes = await Task.WhenAll(
            TryInsertAsync(db, SessionInsert(101, 71, 1)),
            TryInsertAsync(db, SessionInsert(102, 71, 2)));
        Assert.Single(outcomes, number => number == 0);
        Assert.Single(outcomes, number => number == 2601);
        await db.ExecuteAsync($"UPDATE dbo.BrowserSessions SET ExpiresAt=DATEADD(day,-1,SYSDATETIMEOFFSET()) WHERE InvitationId='{Id(71)}';");
        await db.ExpectErrorAsync(2601, SessionInsert(103, 71, 3));
        await db.ExecuteAsync($"""
            BEGIN TRANSACTION;
            UPDATE dbo.BrowserSessions SET EndedAt=SYSDATETIMEOFFSET(), EndReason='EXPIRED'
            WHERE InvitationId='{Id(71)}' AND EndedAt IS NULL;
            {SessionInsert(103, 71, 3)}
            COMMIT;
            """);
        await db.ExecuteAsync(SessionInsert(104, 72, 4));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.BrowserSessions WHERE EndedAt IS NULL;"));
        Assert.Equal(3, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.BrowserSessions;"));
    }

    [SchemaV11Fact]
    public async Task Branches_OnlyOnePendingPerRequesterPoint_OneAcceptedIncludingStaffDirect()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExecuteAsync(BranchInsert(111, 51, 21, 1, 41, 44, "PENDING"));
        // A different registration and variant at the SAME branch point still conflicts.
        await db.ExpectErrorAsync(2601, BranchInsert(112, 52, 21, 1, 41, 45, "PENDING"));
        await db.ExecuteAsync(BranchInsert(113, 52, 21, 2, 41, null, "PENDING"));
        await db.ExecuteAsync($"UPDATE dbo.BranchRequests SET State='EXPIRED', ResolvedAt=SYSDATETIMEOFFSET() WHERE Id='{Id(111)}';");
        await db.ExecuteAsync(BranchInsert(112, 52, 21, 1, 41, 45, "PENDING"));
        await db.ExecuteAsync($"UPDATE dbo.BranchRequests SET State='ACCEPTED', ResolvedAt=SYSDATETIMEOFFSET() WHERE Id='{Id(112)}';");
        await db.ExpectErrorAsync(2601, $"UPDATE dbo.BranchRequests SET State='ACCEPTED' WHERE Id='{Id(113)}';");
        // A different Tour can accept its own branch, and STAFF_DIRECT participates in the same limit.
        await db.ExecuteAsync(BranchInsert(114, 53, 21, 2, 42, null, "ACCEPTED"));
        await db.ExpectErrorAsync(547, BranchInsert(115, 51, 999, 2, 41, null, "REJECTED"));
    }

    [SchemaV11Fact]
    public async Task StopReferencesAndRobotClaims_RejectMissingStops_KeepHistoryAfterRouteChange()
    {
        await using var db = await TestDatabase.CreateAsync();
        await db.ExpectErrorAsync(547, $"UPDATE dbo.Tours SET CurrentRouteStopId='{Id(999)}' WHERE Id='{Id(41)}';");
        await db.ExpectErrorAsync(547, $"UPDATE dbo.Tours SET LastArrivedRouteStopId='{Id(999)}' WHERE Id='{Id(41)}';");
        await db.ExecuteAsync($"""
            UPDATE dbo.Tours SET ActiveRouteId='{Id(12)}', CurrentRouteStopId='{Id(22)}',
                LastArrivedRouteStopId='{Id(21)}' WHERE Id='{Id(41)}';
            UPDATE dbo.Robots SET CurrentTourId='{Id(41)}' WHERE Id='{Id(81)}';
            """);
        Assert.Equal(Guid.Parse(Id(21)), await db.ScalarAsync<Guid>($"SELECT LastArrivedRouteStopId FROM dbo.Tours WHERE Id='{Id(41)}';"));
        await db.ExpectErrorAsync(2601, $"UPDATE dbo.Robots SET CurrentTourId='{Id(41)}' WHERE Id='{Id(82)}';");
        await db.ExecuteAsync($"UPDATE dbo.Robots SET CurrentTourId=NULL WHERE Id='{Id(81)}'; UPDATE dbo.Robots SET CurrentTourId='{Id(41)}' WHERE Id='{Id(82)}';");
        // AssignedRobotId is historical; it must not be globally unique.
        await db.ExecuteAsync($"UPDATE dbo.Tours SET AssignedRobotId='{Id(81)}', State='COMPLETED' WHERE Id IN ('{Id(41)}','{Id(42)}');");
    }

    [SchemaV11Fact]
    public async Task LogRole_AllowsAppendAndRead_RejectsUpdateDelete_AndPreservesEmailStages()
    {
        await using var db = await TestDatabase.CreateAsync();
        // Reapplying permissions must be safe and keep the role's restriction.
        await db.ApplyFileAsync("permissions.sql");
        await db.ApplyFileAsync("permissions.sql");
        await db.ExecuteAsync("CREATE USER schema_test_app WITHOUT LOGIN; ALTER ROLE campus_tour_app ADD MEMBER schema_test_app;");
        await using var connection = await db.OpenAsync();
        await ExecuteAsync(connection, "EXECUTE AS USER='schema_test_app';");
        try
        {
            await ExecuteAsync(connection, $"""
                INSERT dbo.TourEvents(TourId,EventType,OccurredAt) VALUES('{Id(41)}',N'TEST',SYSDATETIMEOFFSET());
                INSERT dbo.AuditLogs(CorrelationId,[Action],EntityType,EntityId,ResultCode,OccurredAt)
                VALUES('{Id(201)}',N'EMAIL_SEND_REQUESTED',N'Invitation','{Id(71)}','PENDING',SYSDATETIMEOFFSET()),
                      ('{Id(201)}',N'EMAIL_SEND_RESULT',N'Invitation','{Id(71)}','ACCEPTED',SYSDATETIMEOFFSET()),
                      ('{Id(202)}',N'EMAIL_SEND_REQUESTED',N'Invitation','{Id(71)}','PENDING',SYSDATETIMEOFFSET()),
                      ('{Id(202)}',N'EMAIL_SEND_RESULT',N'Invitation','{Id(71)}','FAILED',SYSDATETIMEOFFSET());
                """);
            foreach (var table in new[] { "TourEvents", "AuditLogs" })
            {
                await ExpectErrorAsync(connection, 229, $"UPDATE dbo.{table} SET OccurredAt=SYSDATETIMEOFFSET();");
                await ExpectErrorAsync(connection, 229, $"DELETE FROM dbo.{table};");
                await ExecuteAsync(connection, $"SELECT COUNT(*) FROM dbo.{table};");
            }
        }
        finally { await ExecuteAsync(connection, "REVERT;"); }
        Assert.Equal(4, await db.ScalarAsync<int>("SELECT COUNT(*) FROM dbo.AuditLogs;"));
        Assert.Equal(2, await db.ScalarAsync<int>("SELECT COUNT(DISTINCT CorrelationId) FROM dbo.AuditLogs WHERE [Action]='EMAIL_SEND_RESULT' AND ResultCode IN ('ACCEPTED','FAILED');"));
    }

    private static string SessionInsert(int id, int invitation, int hash, bool closed = false) => $"""
        INSERT dbo.BrowserSessions(Id,InvitationId,SessionTokenHash,CreatedAt,ExpiresAt,EndedAt)
        VALUES('{Id(id)}','{Id(invitation)}',CONVERT(binary(32),{hash}),SYSDATETIMEOFFSET(),
            DATEADD(hour,1,SYSDATETIMEOFFSET()),{(closed ? "SYSDATETIMEOFFSET()" : "NULL")});
        """;

    private static string BranchInsert(int id, int allowed, int point, int user, int tour, int? registration, string state) => $"""
        INSERT dbo.BranchRequests(Id,TourId,TourAllowedBranchId,BranchPointRouteStopId,RegistrationId,
            RequestedByUserId,RequestSource,State,RequestedAt)
        VALUES('{Id(id)}','{Id(tour)}','{Id(allowed)}','{Id(point)}',
            {(registration is { } value ? $"'{Id(value)}'" : "NULL")},'{Id(user)}',
            '{(registration.HasValue ? "REPRESENTATIVE" : "STAFF_DIRECT")}','{state}',SYSDATETIMEOFFSET());
        """;

    private static async Task<int> TryInsertAsync(TestDatabase db, string sql)
    {
        try { await db.ExecuteAsync(sql); return 0; }
        catch (SqlException exception) when (exception.Number is 2601 or 2627) { return exception.Number; }
    }

    private static async Task ExecuteAsync(SqlConnection connection, string sql)
    {
        using var command = new SqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task ExpectErrorAsync(SqlConnection connection, int number, string sql)
    {
        var exception = await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(connection, sql));
        Assert.Equal(number, exception.Number);
    }

    private sealed class TestDatabase : IAsyncDisposable
    {
        private readonly string name = "CampusTourSchemaTest_" + Guid.NewGuid().ToString("N");
        private readonly SqlConnectionStringBuilder settings = new(
            Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")!)
            { InitialCatalog = "master", Pooling = false };
        private bool created;

        public static async Task<TestDatabase> CreateAsync()
        {
            var db = new TestDatabase();
            try
            {
                await using (var master = new SqlConnection(db.settings.ConnectionString))
                {
                    await master.OpenAsync();
                    await SchemaV11Tests.ExecuteAsync(master, $"CREATE DATABASE [{db.name}];");
                    db.created = true;
                }
                db.settings.InitialCatalog = db.name;
                await db.ApplyFileAsync("snapshot.sql");
                await db.SeedAsync();
                return db;
            }
            catch { await db.DisposeAsync(); throw; }
        }

        public async Task<SqlConnection> OpenAsync()
        {
            var connection = new SqlConnection(settings.ConnectionString);
            try
            {
                await connection.OpenAsync();
                await SchemaV11Tests.ExecuteAsync(connection, "SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;");
                return connection;
            }
            catch { await connection.DisposeAsync(); throw; }
        }

        public async Task ExecuteAsync(string sql)
        {
            await using var connection = await OpenAsync();
            await SchemaV11Tests.ExecuteAsync(connection, sql);
        }

        public async Task<T> ScalarAsync<T>(string sql)
        {
            await using var connection = await OpenAsync();
            using var command = new SqlCommand(sql, connection);
            return (T)(await command.ExecuteScalarAsync())!;
        }

        public async Task ExpectErrorAsync(int number, string sql)
        {
            await using var connection = await OpenAsync();
            await SchemaV11Tests.ExpectErrorAsync(connection, number, sql);
        }

        public async Task ApplyFileAsync(string file)
        {
            var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", file));
            await using var connection = await OpenAsync();
            foreach (var batch in Regex.Split(script, @"^\s*GO\s*\r?$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                if (!string.IsNullOrWhiteSpace(batch)) await SchemaV11Tests.ExecuteAsync(connection, batch);
        }

        private async Task SeedAsync()
        {
            for (var i = 1; i <= 2; i++)
                await ExecuteAsync($"""
                    INSERT dbo.Users(Id,Username,NormalizedUsername,PasswordHash,FullName,IsActive,CreatedAt)
                    VALUES('{Id(i)}',N'user{i}',N'USER{i}',N'test-only',N'Test User {i}',1,SYSDATETIMEOFFSET());
                    INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
                    VALUES('{Id(80+i)}',N'robot_{i}','EMULATOR',0x01,1,0,SYSDATETIMEOFFSET());
                    INSERT dbo.RefreshTokens(Id,UserId,TokenHash,ExpiresAt,CreatedAt)
                    VALUES('{Id(90+i)}','{Id(i)}',CONVERT(binary(32),{i}),DATEADD(day,1,SYSDATETIMEOFFSET()),SYSDATETIMEOFFSET());
                    """);
            await ExecuteAsync($"""
                INSERT dbo.Pois(Id,Name,MapKey,MapFrame,X,Y,Yaw,IsActive,CreatedAt)
                VALUES('{Id(10)}',N'Branch Point',N'test-map',N'map',0,0,0,1,SYSDATETIMEOFFSET());
                """);
            for (var i = 1; i <= 3; i++)
                await ExecuteAsync($"""
                    INSERT dbo.Routes(Id,Name,MapKey,MapFrame,StartX,StartY,StartYaw,EndMode,IsActive,CreatedAt)
                    VALUES('{Id(10+i)}',N'Route {i}',N'test-map',N'map',0,0,0,'LAST_POI',1,SYSDATETIMEOFFSET());
                    INSERT dbo.RouteStops(Id,RouteId,PoiId,StopOrder,DwellSeconds,HeadStepsJson)
                    VALUES('{Id(20+i)}','{Id(10+i)}','{Id(10)}',1,30,N'[]');
                    """);
            await ExecuteAsync($"""
                INSERT dbo.RouteStops(Id,RouteId,PoiId,StopOrder,DwellSeconds,HeadStepsJson)
                VALUES('{Id(24)}','{Id(11)}','{Id(10)}',2,30,N'[]');
                """);
            for (var i = 1; i <= 2; i++)
                await ExecuteAsync($"""
                    INSERT dbo.RouteVariants(Id,BaseRouteId,BranchPointRouteStopId,VariantRouteId,VariantBranchStopId,Name,IsActive,CreatedAt)
                    VALUES('{Id(30+i)}','{Id(11)}','{Id(21)}','{Id(11+i)}','{Id(21+i)}',N'Variant {i}',1,SYSDATETIMEOFFSET());
                    INSERT dbo.Tours(Id,Name,RouteId,ActiveRouteId,ScheduledStartAt,State,IsHeld,CreatedByUserId,CreatedAt)
                    VALUES('{Id(40+i)}',N'Tour {i}','{Id(11)}','{Id(11)}',SYSDATETIMEOFFSET(),'SCHEDULED',0,'{Id(1)}',SYSDATETIMEOFFSET());
                    INSERT dbo.GroupRegistrations(Id,TourId,RepresentativeUserId,SchoolName,GroupName,ContactName,ContactEmail,State,SubmittedAt,CreatedAt)
                    VALUES('{Id(43+i)}','{Id(41)}','{Id(1)}',N'Test School',N'Group {i}',N'Test Contact',N'contact{i}@example.invalid','APPROVED',SYSDATETIMEOFFSET(),SYSDATETIMEOFFSET());
                    INSERT dbo.RosterRows(Id,RegistrationId,RowNumber,RowType,DisplayName,Email,IsActive,CreatedAt)
                    VALUES('{Id(60+i)}','{Id(43+i)}',1,'INDIVIDUAL',N'Test Student {i}',N'student{i}@example.invalid',1,SYSDATETIMEOFFSET());
                    INSERT dbo.Invitations(Id,RosterRowId,AccessCodeHash,AccessCodeProtected,AccessVersion,CodeIssuedAt,ExpiresAt,CreatedAt)
                    VALUES('{Id(70+i)}','{Id(60+i)}',CONVERT(binary(32),{i}),0x01,1,SYSDATETIMEOFFSET(),DATEADD(day,1,SYSDATETIMEOFFSET()),SYSDATETIMEOFFSET());
                    INSERT dbo.TourAllowedBranches(Id,TourId,RouteVariantId,IsEnabled,CreatedAt)
                    VALUES('{Id(50+i)}','{Id(41)}','{Id(30+i)}',1,SYSDATETIMEOFFSET());
                    """);
            await ExecuteAsync($"""
                INSERT dbo.TourAllowedBranches(Id,TourId,RouteVariantId,IsEnabled,CreatedAt)
                VALUES('{Id(53)}','{Id(42)}','{Id(31)}',1,SYSDATETIMEOFFSET());
                """);
        }

        public async ValueTask DisposeAsync()
        {
            if (!created) return;
            // The name is generated internally, never read from the supplied connection string.
            var masterSettings = new SqlConnectionStringBuilder(settings.ConnectionString) { InitialCatalog = "master" };
            await using var master = new SqlConnection(masterSettings.ConnectionString);
            await master.OpenAsync();
            await SchemaV11Tests.ExecuteAsync(master, $"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}];");
            created = false;
        }
    }
}
