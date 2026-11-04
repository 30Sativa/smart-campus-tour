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
                "Invitations", "MapAreas", "MapDeploymentChecks", "MapVersions", "PoiImportReceipts", "PoiProposalRevisions",
                "PoiProposalSubmissions", "PoiProposals", "PoiVerificationRecords", "Pois", "RefreshTokens",
                "RobotCommands", "Robots", "RosterEmailChangeRequests", "RosterRows", "Routes", "RouteRevisions", "RouteRevisionStops",
                "RouteRevisionSubmissions", "RouteTestRuns", "RouteStops", "RouteVariants", "TourAllowedBranches",
                "TourEvents", "TourRobotReservations", "Tours", "UserRoles", "Users"
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
                     typeof(TourAllowedBranch), typeof(Poi), typeof(RobotCommand)
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
    public void Model_MapsVersionedPoiContentAndRouteStopSnapshotsToBoundedNullableColumns()
    {
        using var context = new ApplicationDbContext(Options);
        foreach (var (type, name, maxLength) in new[]
                 {
                     (typeof(PoiProposalRevision), nameof(PoiProposalRevision.NarrationText), 4000),
                     (typeof(PoiProposalRevision), nameof(PoiProposalRevision.FallbackVideoUrl), 2048),
                     (typeof(RouteRevisionStop), nameof(RouteRevisionStop.NarrationText), 4000),
                     (typeof(RouteRevisionStop), nameof(RouteRevisionStop.FallbackVideoUrl), 2048)
                 })
        {
            var property = context.Model.FindEntityType(type)!.FindProperty(name)!;
            Assert.Equal(typeof(string), property.ClrType);
            Assert.True(property.IsNullable);
            Assert.Equal(maxLength, property.GetMaxLength());
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

    [Fact]
    public void Model_MapsRobotCommandsAsManyPerRobotTourLegAndStop()
    {
        using var context = new ApplicationDbContext(Options);
        var commands = context.Model.FindEntityType(typeof(RobotCommand))!;

        // The filtered unique indexes (one open GoTo per robot, one GoTo per leg) must not become one-to-one navigations.
        foreach (var (principal, property) in new[]
                 {
                     (typeof(Robot), nameof(RobotCommand.RobotId)), (typeof(Tour), nameof(RobotCommand.TourId)),
                     (typeof(RouteRevisionStop), nameof(RobotCommand.RouteRevisionStopId)),
                     (typeof(RobotCommand), nameof(RobotCommand.TargetCommandId)),
                     (typeof(User), nameof(RobotCommand.IssuedByUserId)), (typeof(User), nameof(RobotCommand.ResolvedByUserId))
                 })
        {
            var foreignKey = Assert.Single(commands.GetForeignKeys(), key => key.PrincipalEntityType.ClrType == principal
                && key.Properties.Select(item => item.Name).SequenceEqual(new[] { property }));
            Assert.False(foreignKey.IsUnique, property);
        }
        Assert.Equal("decimal(10,4)", commands.FindProperty(nameof(RobotCommand.X))!.GetColumnType().Replace(" ", ""));
        Assert.Equal("decimal(9,6)", commands.FindProperty(nameof(RobotCommand.Yaw))!.GetColumnType().Replace(" ", ""));
        Assert.True(commands.FindProperty(nameof(RobotCommand.X))!.IsNullable);
        Assert.Equal(3, commands.GetIndexes().Count(index => index.IsUnique && index.GetFilter() is not null));
        AssertForeignKey<Tour, RouteRevisionStop>(context, nameof(Tour.CurrentRevisionStopId));
        AssertForeignKey<Tour, RouteRevisionStop>(context, nameof(Tour.LastArrivedRevisionStopId));
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
