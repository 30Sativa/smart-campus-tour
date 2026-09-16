using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Common.Authorization;

namespace SmartCampus.Api.Hubs
{
    [Authorize(Policy = StaffPolicies.StaffOnly)]
    public sealed class StaffOperationsHub : Hub
    {
    }
}
