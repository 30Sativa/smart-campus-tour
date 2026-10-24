using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace SmartCampus.Api;

/// <summary>Owns only a generated local fixture database until setup has durably published its ticket.</summary>
internal sealed class LocalFixtureDatabase : IAsyncDisposable
{
    public const string ReuseStudentAi = "--reuse-student-ai-local";
    public const string ReuseRegistration = "--reuse-registration-local";
    public const string RealEmail = "--local-real-email";
    private readonly SqlConnectionStringBuilder settings;
    private readonly string database;
    private bool retained;

    private LocalFixtureDatabase(SqlConnectionStringBuilder settings, string database)
    {
        this.settings = settings;
        this.database = database;
    }

    public string ConnectionString => settings.ConnectionString;

    public static SqlConnectionStringBuilder Validate(WebApplicationBuilder builder, string prefix, bool reuse)
    {
        if (!builder.Environment.IsDevelopment()) throw new StudentAiLocalSetupException("Local fixture requires Development.");
        var connection = new SqlConnectionStringBuilder(builder.Configuration.GetConnectionString("DefaultConnection"));
        var host = connection.DataSource.Split(',')[0].Split('\\')[0].ToLowerInvariant();
        if (host is not ("localhost" or "127.0.0.1" or "." or "(local)" or "(localdb)"))
            throw new StudentAiLocalSetupException("Local fixture requires a local SQL Server.");
        if (reuse && !Regex.IsMatch(connection.InitialCatalog, "^" + Regex.Escape(prefix) + "[a-f0-9]{32}$"))
            throw new StudentAiLocalSetupException("Local fixture reuse requires its generated database name.");
        return connection;
    }

    public static async Task<LocalFixtureDatabase> CreateAsync(SqlConnectionStringBuilder connection, string prefix, string schema)
    {
        if (prefix is not (StudentAiLocalCommand.DatabasePrefix or RegistrationLocalCommand.DatabasePrefix))
            throw new StudentAiLocalSetupException("Unknown local fixture database kind.");
        var database = prefix + Guid.NewGuid().ToString("N");
        connection = new SqlConnectionStringBuilder(connection.ConnectionString) { InitialCatalog = "master", Pooling = false };
        await using (var master = new SqlConnection(connection.ConnectionString))
        {
            await master.OpenAsync();
            await using var create = new SqlCommand($"CREATE DATABASE [{database}]", master);
            await create.ExecuteNonQueryAsync();
        }
        connection.InitialCatalog = database;
        var owner = new LocalFixtureDatabase(connection, database);
        try
        {
            await using var sql = new SqlConnection(connection.ConnectionString);
            await sql.OpenAsync();
            foreach (var batch in Regex.Split(schema, @"^\s*GO\s*\r?$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(batch)) continue;
                await using var command = new SqlCommand(batch, sql);
                await command.ExecuteNonQueryAsync();
            }
            return owner;
        }
        catch { await owner.DisposeAsync(); throw; }
    }

    public void Retain() => retained = true;

    public async ValueTask DisposeAsync()
    {
        if (retained) return;
        // The name was generated in CreateAsync; never drop a caller-supplied catalog, even on failure.
        if (!Regex.IsMatch(database, @"^SmartCampus(StudentAi|Registration)Local_[a-f0-9]{32}$"))
            throw new InvalidOperationException("Invalid owned fixture database name.");
        var masterSettings = new SqlConnectionStringBuilder(settings.ConnectionString) { InitialCatalog = "master" };
        try
        {
            await using var master = new SqlConnection(masterSettings.ConnectionString);
            await master.OpenAsync();
            await using var drop = new SqlCommand($"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}];", master);
            await drop.ExecuteNonQueryAsync();
        }
        catch (SqlException)
        {
            Console.Error.WriteLine($"Could not remove failed local fixture {database}; remove only that owned database manually.");
        }
    }
}
