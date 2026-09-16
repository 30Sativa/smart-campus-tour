using SmartCampus.Application.Auth.DTOs;

namespace SmartCampus.Application.Auth
{
    public interface IAuthService
    {
        Task<AuthResponse> RegisterAsync(RegisterRequest request);
        Task<AuthResponse> LoginAsync(LoginRequest request);
        Task<AuthResponse> RefreshTokenAsync(string refreshToken);
        Task LogoutAsync(string refreshToken);
        Task<UserDto> GetUserByIdAsync(Guid userId);
    }
}
