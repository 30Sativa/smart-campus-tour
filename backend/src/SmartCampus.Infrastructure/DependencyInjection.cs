using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Auth;
using SmartCampus.Application.Bookings;
using SmartCampus.Application.Routes;
using SmartCampus.Application.Staff;
using SmartCampus.Infrastructure.Auth;
using SmartCampus.Infrastructure.Bookings;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Routes;
using SmartCampus.Infrastructure.Staff;

namespace SmartCampus.Infrastructure
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection");

            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(connectionString));

            services.AddScoped<IAuthService, AuthService>();
            services.AddScoped<IRouteService, RouteService>();
            services.AddScoped<IBookingService, BookingService>();
            services.AddScoped<IStaffOperationsService, StaffOperationsService>();

            return services;
        }
    }
}
