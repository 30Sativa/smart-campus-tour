using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.TourTalk.Queries.GetTourTalk;

/// <summary>ADR-0070: every Staff may follow a Tour's conversation; only its Operator may send (<see cref="TourTalkFeed.CanSend"/>).</summary>
public sealed record GetStaffTourTalkQuery(Guid TourId, Guid Actor, Guid? Epoch, long After) : IRequest<TourTalkFeed>;

/// <summary>ADR-0070: a Viewer reads the Operator's messages and its own replies.</summary>
public sealed record GetViewerTourTalkQuery(Guid TourId, string? SessionToken, Guid? Epoch, long After) : IRequest<TourTalkFeed>;

/// <summary>A Staff voice clip, for any Staff following the Tour.</summary>
public sealed record GetStaffTourTalkAudioQuery(Guid TourId, Guid MessageId) : IRequest<TourTalkAudio>;

/// <summary>A Staff voice clip, for a Viewer of the Tour.</summary>
public sealed record GetViewerTourTalkAudioQuery(Guid TourId, string? SessionToken, Guid MessageId) : IRequest<TourTalkAudio>;

public sealed class GetTourTalkQueryHandlers(ITourTalkReader reader, IInvitationCodeService codes, InvitationSettings settings,
    TourTalkStore store, TimeProvider clock) :
    IRequestHandler<GetStaffTourTalkQuery, TourTalkFeed>,
    IRequestHandler<GetViewerTourTalkQuery, TourTalkFeed>,
    IRequestHandler<GetStaffTourTalkAudioQuery, TourTalkAudio>,
    IRequestHandler<GetViewerTourTalkAudioQuery, TourTalkAudio>
{
    public async Task<TourTalkFeed> Handle(GetStaffTourTalkQuery query, CancellationToken ct)
    {
        var tour = await reader.GetTourAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var open = TourTalkWindow.IsOpen(tour.State, tour.ScheduledStartAt, clock.GetUtcNow());
        var (last, entries) = store.Read(tour.TourId, query.Epoch, query.After, _ => true);
        return new TourTalkFeed(store.Epoch, last, open, open && tour.OperatorUserId == query.Actor,
            entries.Select(entry => entry.ForStaff()).ToList());
    }

    public async Task<TourTalkFeed> Handle(GetViewerTourTalkQuery query, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var viewer = await TourTalkViewerAccess.ResolveAsync(reader, codes, settings, query.TourId, query.SessionToken, now, ct);
        var open = TourTalkWindow.IsOpen(viewer.TourState, viewer.ScheduledStartAt, now);
        var (last, entries) = store.Read(query.TourId, query.Epoch, query.After, entry => Visible(entry, viewer.RosterRowId));
        return new TourTalkFeed(store.Epoch, last, open, open, entries.Select(entry => entry.ForViewer(viewer.RosterRowId)).ToList());
    }

    public async Task<TourTalkAudio> Handle(GetStaffTourTalkAudioQuery query, CancellationToken ct)
    {
        _ = await reader.GetTourAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        return Audio(store.Find(query.TourId, query.MessageId));
    }

    public async Task<TourTalkAudio> Handle(GetViewerTourTalkAudioQuery query, CancellationToken ct)
    {
        var viewer = await TourTalkViewerAccess.ResolveAsync(reader, codes, settings, query.TourId, query.SessionToken,
            clock.GetUtcNow(), ct);
        var entry = store.Find(query.TourId, query.MessageId);
        return Audio(entry is not null && Visible(entry, viewer.RosterRowId) ? entry : null);
    }

    private static bool Visible(TourTalkEntry entry, Guid rosterRowId) =>
        entry.From == TourTalkSenders.Staff || entry.RosterRowId == rosterRowId;

    private static TourTalkAudio Audio(TourTalkEntry? entry)
    {
        var (content, type) = (entry?.Audio, entry?.AudioType);
        return content is null || type is null
            ? throw new NotFoundException("Đoạn ghi âm không còn được lưu.")
            : new TourTalkAudio(content, type);
    }
}
