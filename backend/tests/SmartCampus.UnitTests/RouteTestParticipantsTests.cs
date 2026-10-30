using System.Reflection;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class RouteTestParticipantsTests
{
    [Fact]
    public async Task Lists_only_accounts_a_test_run_would_accept()
    {
        var staff = User("staff", "STAFF");
        var technicalAndStaff = User("both", "STAFF", "TECHNICAL_STAFF");
        var repository = DispatchProxy.Create<IRouteRevisionRepository, StubProxy>();
        ((StubProxy)(object)repository).Users = [staff, technicalAndStaff];

        var result = await new ListRouteTestParticipantsHandler(repository).Handle(new ListRouteTestParticipantsQuery(), default);

        var participant = Assert.Single(result);
        Assert.Equal(new RouteTestParticipantView(staff.Id, staff.FullName, staff.Username), participant);
    }

    private static User User(string username, params string[] roles) => new()
    {
        Id = Guid.NewGuid(), Username = username, FullName = $"Name {username}", IsActive = true,
        UserRoles = roles.Select(role => new UserRole { Role = role }).ToList()
    };

    public class StubProxy : DispatchProxy
    {
        internal IReadOnlyList<User> Users { get; set; } = [];
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => targetMethod?.Name switch
        {
            nameof(IRouteRevisionRepository.ListActiveStaffUsersAsync) => Task.FromResult(Users),
            _ => throw new NotImplementedException(targetMethod?.Name)
        };
    }
}
