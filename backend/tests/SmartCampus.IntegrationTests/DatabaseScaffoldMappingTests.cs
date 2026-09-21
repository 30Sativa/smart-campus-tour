using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class DatabaseScaffoldMappingTests
{
    private static readonly DbContextOptions<ApplicationDbContext> Options =
        new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer("Server=(localdb)\\mssqllocaldb;Database=SmartCampusModelTests;Trusted_Connection=True;")
            .Options;

    [Fact]
    public void Model_ContainsOnlyTablesFromCurrentSchema()
    {
        using var context = new ApplicationDbContext(Options);

        var tables = context.Model.GetEntityTypes()
            .Select(entity => entity.GetTableName())
            .OrderBy(name => name)
            .ToArray();

        Assert.Equal(
            new[]
            {
                "AuditLogs", "GroupRegistrations", "Pois", "RefreshTokens",
                "Robots", "RosterRows", "Routes", "RouteStops", "TourEvents",
                "Tours", "UserRoles", "Users"
            }.OrderBy(name => name),
            tables);
    }

    [Fact]
    public void Model_PreservesBinaryHashesAndConcurrencyTokens()
    {
        using var context = new ApplicationDbContext(Options);

        var tokenHash = context.Model.FindEntityType(typeof(RefreshToken))!
            .FindProperty(nameof(RefreshToken.TokenHash))!;
        var groupCodeHash = context.Model.FindEntityType(typeof(GroupRegistration))!
            .FindProperty(nameof(GroupRegistration.GroupCodeHash))!;

        Assert.Equal(typeof(byte[]), tokenHash.ClrType);
        Assert.Equal(32, tokenHash.GetMaxLength());
        Assert.Equal(typeof(byte[]), groupCodeHash.ClrType);
        Assert.Equal(32, groupCodeHash.GetMaxLength());

        foreach (var entityType in new[]
                 {
                     typeof(Robot), typeof(Tour), typeof(GroupRegistration)
                 })
        {
            var rowVersion = context.Model.FindEntityType(entityType)!
                .FindProperty("RowVersion")!;
            Assert.Equal(typeof(byte[]), rowVersion.ClrType);
            Assert.True(rowVersion.IsConcurrencyToken);
            Assert.Equal(ValueGenerated.OnAddOrUpdate, rowVersion.ValueGenerated);
        }
    }

    [Fact]
    public void Model_PreservesRegistrationAndAssignmentRelationships()
    {
        using var context = new ApplicationDbContext(Options);

        AssertForeignKey<GroupRegistration, Tour>(
            context, nameof(GroupRegistration.TourId));
        AssertForeignKey<GroupRegistration, User>(
            context, nameof(GroupRegistration.RepresentativeUserId));
        AssertForeignKey<GroupRegistration, User>(
            context, nameof(GroupRegistration.ReviewedByUserId));
        AssertForeignKey<RosterRow, GroupRegistration>(
            context, nameof(RosterRow.RegistrationId));
        AssertForeignKey<Tour, Robot>(
            context, nameof(Tour.AssignedRobotId));
        AssertForeignKey<Robot, Tour>(
            context, nameof(Robot.CurrentTourId));
    }

    private static void AssertForeignKey<TDependent, TPrincipal>(
        ApplicationDbContext context,
        string propertyName)
    {
        var entityType = context.Model.FindEntityType(typeof(TDependent))!;
        Assert.Contains(entityType.GetForeignKeys(), foreignKey =>
            foreignKey.PrincipalEntityType.ClrType == typeof(TPrincipal)
            && foreignKey.Properties.Select(property => property.Name)
                .SequenceEqual(new[] { propertyName }));
    }
}
