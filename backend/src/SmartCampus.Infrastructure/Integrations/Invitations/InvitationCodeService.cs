using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Abstractions.Invitations;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

public sealed class InvitationCodeService(InvitationConfiguration configuration) : IInvitationCodeService
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    public InvitationCode Create(Guid invitationId, int version)
    {
        RequireEnabled();
        var code = new string(RandomNumberGenerator.GetBytes(20).Select(b => Alphabet[b & 31]).ToArray());
        var plaintext = Encoding.UTF8.GetBytes(code);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var cipher = new byte[plaintext.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(configuration.ProtectionKey, 16);
        aes.Encrypt(nonce, plaintext, cipher, tag, AssociatedData(invitationId, version));
        return new(Hash(code), [.. nonce, .. tag, .. cipher]);
    }
    public string Reveal(Guid invitationId, int version, byte[] protectedCode)
    {
        RequireEnabled();
        if (protectedCode.Length != 48) throw new CryptographicException("Invalid protected invitation.");
        var plaintext = new byte[20];
        using var aes = new AesGcm(configuration.ProtectionKey, 16);
        aes.Decrypt(protectedCode.AsSpan(0, 12), protectedCode.AsSpan(28), protectedCode.AsSpan(12, 16),
            plaintext, AssociatedData(invitationId, version));
        var code = Encoding.UTF8.GetString(plaintext);
        return string.Join("-", Enumerable.Range(0, 4).Select(index => code.Substring(index * 5, 5)));
    }
    public byte[] Hash(string code)
    {
        RequireEnabled();
        var normalized = new string(code.Trim().ToUpperInvariant().Where(c => c != '-' && !char.IsWhiteSpace(c)).ToArray());
        return HMACSHA256.HashData(configuration.HashKey, Encoding.UTF8.GetBytes(normalized));
    }
    private static byte[] AssociatedData(Guid id, int version) => Encoding.UTF8.GetBytes($"campus-tour-invitation:{id:D}:{version}");
    private void RequireEnabled()
    {
        if (!configuration.Settings.Enabled) throw new InvalidOperationException("Invitations are disabled.");
    }
}
