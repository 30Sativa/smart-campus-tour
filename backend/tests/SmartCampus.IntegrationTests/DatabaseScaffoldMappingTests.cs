using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class DatabaseScaffoldMappingTests
{
    private static readonly DbContextOptions<ApplicationDbContext> Options =
        new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer("Server=localhost,1433;Database=SmartCampusModelTests;Trusted_Connection=True;TrustServerCertificate=True;")
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
                "AuditLogs", "BranchRequests", "BrowserSessions", "GroupRegistrations",
                "Invitations", "Pois", "RefreshTokens", "Robots", "RosterRows",
                "Routes", "RouteStops", "RouteVariants", "TourAllowedBranches",
                "TourEvents", "Tours", "UserRoles", "Users"
            }.OrderBy(name => name),
            tables);
    }

    [Fact]
    public void Model_PreservesBinaryHashesAndConcurrencyTokens()
    {
        using var context = new ApplicationDbContext(Options);

        var tokenHash = context.Model.FindEntityType(typeof(RefreshToken))!
            .FindProperty(nameof(RefreshToken.TokenHash))!;
        var accessCodeHash = context.Model.FindEntityType(typeof(Invitation))!
            .FindProperty(nameof(Invitation.AccessCodeHash))!;
        var sessionTokenHash = context.Model.FindEntityType(typeof(BrowserSession))!
            .FindProperty(nameof(BrowserSession.SessionTokenHash))!;

        Assert.Equal(typeof(byte[]), tokenHash.ClrType);
        Assert.Equal(32, tokenHash.GetMaxLength());
        Assert.Equal(typeof(byte[]), accessCodeHash.ClrType);
        Assert.Equal(32, accessCodeHash.GetMaxLength());
        Assert.Equal(typeof(byte[]), sessionTokenHash.ClrType);
        Assert.Equal(32, sessionTokenHash.GetMaxLength());

        foreach (var entityType in new[]
                 {
                     typeof(Robot), typeof(Tour), typeof(GroupRegistration),
                     typeof(RosterRow), typeof(Invitation), typeof(BranchRequest),
                     typeof(TourAllowedBranch), typeof(Poi)
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
        AssertForeignKey<Tour, RouteStop>(
            context, nameof(Tour.CurrentRouteStopId));
        AssertForeignKey<Tour, RouteStop>(
            context, nameof(Tour.LastArrivedRouteStopId));
        AssertForeignKey<Robot, Tour>(
            context, nameof(Robot.CurrentTourId));
        AssertForeignKey<BranchRequest, RouteStop>(
            context, nameof(BranchRequest.BranchPointRouteStopId));

        var branchRequests = context.Model.FindEntityType(typeof(BranchRequest))!;
        var tourRequestRelationship = Assert.Single(branchRequests.GetForeignKeys(), foreignKey =>
            foreignKey.PrincipalEntityType.ClrType == typeof(Tour)
            && foreignKey.Properties.Select(property => property.Name)
                .SequenceEqual(new[] { nameof(BranchRequest.TourId) }));
        Assert.False(tourRequestRelationship.IsUnique);

        var browserSessions = context.Model.FindEntityType(typeof(BrowserSession))!;
        var invitationSessionRelationship = Assert.Single(browserSessions.GetForeignKeys(), foreignKey =>
            foreignKey.PrincipalEntityType.ClrType == typeof(Invitation)
            && foreignKey.Properties.Select(property => property.Name)
                .SequenceEqual(new[] { nameof(BrowserSession.InvitationId) }));
        Assert.False(invitationSessionRelationship.IsUnique);
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
