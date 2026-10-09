using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations;

public sealed class InvitationIssuer(IInvitationRepository repository, IInvitationCodeService codes, InvitationSettings settings)
{
    public async Task IssueAsync(GroupRegistration registration, Tour tour, Guid actor, DateTimeOffset now, CancellationToken ct)
    {
        var expiry = tour.ScheduledStartAt.AddHours(settings.ExpiryHoursAfterStart);
        if (expiry <= now) throw new ConflictException("Giờ Tour và hạn lời mời đã qua.", "INVITATION_EXPIRED");
        var existing = (await repository.LoadAsync(registration.Id, ct)).Select(i => i.RosterRowId).ToHashSet();
        foreach (var row in registration.RosterRows.Where(r => r.IsActive && !existing.Contains(r.Id)))
        {
            var id = Guid.NewGuid();
            var code = await CreateCodeAsync(id, 1, ct);
            var invitation = new Invitation { Id = id, RosterRowId = row.Id, RosterRow = row,
                AccessCodeHash = code.Hash, AccessCodeProtected = code.Protected, AccessVersion = 1,
                CodeIssuedAt = now, ExpiresAt = expiry, CreatedAt = now };
            repository.Add(invitation);
            repository.AddAudit(InvitationAudit.Create(tour.Id, actor, "INVITATION_ISSUED", id.ToString("D"), Guid.NewGuid(), now, "OK"));
            repository.AddAudit(InvitationAudit.Request(invitation, tour.Id, actor, now));
        }
    }
    public async Task<InvitationCode> CreateCodeAsync(Guid id, int version, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var code = codes.Create(id, version);
            if (!await repository.HashExistsAsync(code.Hash, ct)) return code;
        }
        throw new InvalidOperationException("Could not allocate a unique invitation code.");
    }
}
