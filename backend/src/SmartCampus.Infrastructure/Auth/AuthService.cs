using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using SmartCampus.Application.Auth;
using SmartCampus.Application.Auth.DTOs;
using SmartCampus.Application.Common.Authorization;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace SmartCampus.Infrastructure.Auth
{
    public class AuthService : IAuthService
    {
        private readonly ApplicationDbContext _context;
        private readonly IConfiguration _config;

        public AuthService(ApplicationDbContext context, IConfiguration config)
        {
            _context = context;
            _config = config;
        }

        public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
        {
            if (await _context.Users.AnyAsync(u => u.Username == request.Username))
                throw new Exception("Username already exists");

            var user = new User
            {
                Username = request.Username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role = StaffRoles.Visitor
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return await GenerateAuthResponse(user);
        }

        public async Task<AuthResponse> LoginAsync(LoginRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == request.Username);
            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                throw new Exception("Invalid username or password");

            return await GenerateAuthResponse(user);
        }

        public async Task<AuthResponse> RefreshTokenAsync(string refreshToken)
        {
            var tokenEntity = await _context.RefreshTokens
                .Include(r => r.User)
                .FirstOrDefaultAsync(r => r.Token == refreshToken);

            if (tokenEntity == null || !tokenEntity.IsActive)
                throw new Exception("Invalid refresh token");

            // Revoke the old token
            tokenEntity.Revoked = DateTime.UtcNow;

            // Generate new response
            return await GenerateAuthResponse(tokenEntity.User!);
        }

        public async Task LogoutAsync(string refreshToken)
        {
            var tokenEntity = await _context.RefreshTokens.FirstOrDefaultAsync(r => r.Token == refreshToken);
            if (tokenEntity != null && tokenEntity.IsActive)
            {
                tokenEntity.Revoked = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }
        }

        public async Task<UserDto> GetUserByIdAsync(Guid userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) throw new Exception("User not found");

            return new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Role = StaffRoles.Normalize(user.Role),
                CreatedAt = user.CreatedAt
            };
        }

        private async Task<AuthResponse> GenerateAuthResponse(User user)
        {
            var jwtToken = GenerateJwtToken(user);
            var refreshToken = GenerateRefreshToken(user.Id);

            _context.RefreshTokens.Add(refreshToken);
            await _context.SaveChangesAsync();

            return new AuthResponse
            {
                AccessToken = jwtToken,
                RefreshToken = refreshToken.Token,
                UserId = user.Id,
                Username = user.Username,
                Role = StaffRoles.Normalize(user.Role)
            };
        }

        private string GenerateJwtToken(User user)
        {
            var role = StaffRoles.Normalize(user.Role);
            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new("role", role),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(15), // Access token 15 min
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private RefreshToken GenerateRefreshToken(Guid userId)
        {
            var randomBytes = new byte[32];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomBytes);
            
            return new RefreshToken
            {
                UserId = userId,
                Token = Convert.ToBase64String(randomBytes),
                Expires = DateTime.UtcNow.AddDays(7), // Refresh token 7 days
                Created = DateTime.UtcNow
            };
        }
    }
}
