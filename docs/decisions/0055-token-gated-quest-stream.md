# ADR-0055: Watching the Quest stream needs a token from the backend

- **Status:** Proposed 11/11/2026 after the 11/11/2026 review; implemented in code. The relay and the NUC are checked
  only on hardware (the pull request carries a READY FOR HARDWARE TEST note). Needs the repository owner's acceptance.
- **Follows:** ADR-0052 ("Token-gated reading is a separate decision").
- **Related:** ADR-0010 and ADR-0015 (only invited viewers see the Tour), FR-25/FR-38/FR-48, NFR-SEC-02,
  ADR-0019 (single API instance), `robot/quest-stream/README.md` ("Phát ra Internet").

## Context

The public MediaMTX relay on the EC2 host gives `user: any` the right to read `quest`, and the web bundle carries the
relay's WHEP URL in `VITE_QUEST_WHEP_URL`. Anyone who opens the JavaScript can watch the camera whenever it runs,
without an invitation code, and End Early (FR-48) cannot take the picture away from anyone. ADR-0052 only limits when
the camera runs.

The NUC publishes to the relay over SRT with a user and password in the stream id, checked by MediaMTX's internal
users. That must keep working, and a wrong password must still be refused.

## Options

MediaMTX has one `authMethod` for every action; a server cannot mix internal users with another method.

| | `authMethod: http` | `authMethod: jwt` |
|---|---|---|
| How | MediaMTX POSTs `{user, password, token, ip, action, path, protocol, id, query}` to a URL on every connect; 2xx allows | MediaMTX checks a JWT locally against a JWKS URL; permissions come from a claim |
| NUC publish | The backend checks the publish user and password (it stores only their SHA-256) | The NUC needs a JWT with `publish`: a long-lived token minted by the backend, and a change on the NUC. Excluding `publish` from auth instead would leave WHIP/SRT publishing open |
| Revocation | Live: each new connection is checked against the current Tour and session | None until the token expires |
| Backend work | One endpoint, an HMAC token, no keys to publish | An RSA/EC key pair that survives restarts, a JWKS endpoint, key rotation |
| Backend down | New viewers and a reconnecting NUC are refused (fail closed); open connections keep playing | Viewers with a token keep connecting; the JWKS is cached |

## Decision

1. **`authMethod: http`** on the relay. It is the smaller change and the only one that keeps the NUC's publish
   credentials checked without touching the NUC. `authHTTPAddress` is
   `https://<api host>/api/internal/stream-relay/auth?key=<relay key>`; `authHTTPExclude` keeps only `api`, which
   listens on `127.0.0.1:9997`.
2. **The backend decides.** `POST /api/internal/stream-relay/auth` (anonymous, needs the relay key, own rate limit)
   answers 204 to allow:
   - `publish` on the configured path when user and SHA-256 of the password match `QuestRelay:PublishUser` and
     `QuestRelay:PublishPasswordSha256` (compared in constant time);
   - `read` on the configured path when the WHEP URL's `token` query parameter is a valid, unexpired token whose holder
     is still entitled now (point 4);

   and 403 to anything else. A wrong relay key, or a server without `QuestRelay`, gets 401.
3. **Token.** `v1.<kind>.<subject>.<robot>.<expires>.<HMAC-SHA256>`, signed with a key derived from
   `QuestRelay:Key`. It lives `QuestRelay:TokenSeconds` (default 120, at most 300). It is opaque to the browser and
   says nothing the browser does not already know.
4. **Who gets one, checked again on every use:**
   - a Student session that is open, unexpired and unrevoked, on an active ACCEPTED row, whose Tour is `RUNNING` on
     `AssignedRobotId` = the relay's robot, or `SCHEDULED`/`READY` (the waiting room) with an unreleased reservation on
     that robot: `GET /api/student/tours/{tourId}/stream-access` with the Student cookie;
   - a Staff user, through the existing `POST /api/staff/manage/robots/{robotCode}/camera-lease`, which now also
     returns `stream` while the lease on the relay's robot is live.

   A revoked session, an ended or cancelled Tour (End Early included), another robot or no session gets no token and
   no renewal: 401 without a valid session, 409 `STREAM_NOT_AVAILABLE` otherwise.
5. **The browser renews.** The Student page asks again at half the token's life, the Staff page with every lease
   renewal (30 s). A failed renewal closes the player. The token only matters when connecting, so a renewal never
   reconnects a playing stream.
6. **Open connections are cut within about 5 seconds.** MediaMTX checks auth only when a connection opens. A small
   service installed with the relay, `mediamtx-relay-reaper`, lists `GET 127.0.0.1:9997/v3/webrtcsessions/list` every
   5 s and posts each session's path and query to `POST /api/internal/stream-relay/recheck`; only on 403 it kicks the
   session (`POST /v3/webrtcsessions/kick/{id}`). Recheck ignores the token's expiry (a viewer who joined in time keeps
   watching) but checks the signature and the entitlement of point 4, so End Early, a revoked session or an expired
   Staff lease ends the picture. When the backend does not answer, or answers 401 (a key mismatch), the reaper kicks
   nobody (as ADR-0052, an outage must not black out a running Tour). A session reported without a query is left
   alone: it cannot be checked, and the relay only admitted it with a token.
7. **The URL leaves the bundle.** The relay URL is `QuestRelay:WhepUrl` and reaches the browser only with a token.
   `VITE_QUEST_WHEP_URL` is read only by the Vite dev server, for the NUC's own MediaMTX on a LAN.

## Consequences

- The relay must be reinstalled (`install-relay.sh`), and the API needs `QuestRelay:*` in `/etc/campustour/api.env`;
  the installer prints the lines. Until both are done the live picture is off for everyone, which is the safe side.
- While the backend is down nobody can start watching and the NUC cannot reconnect; open connections continue.
- The relay key is in a URL in the relay's config file (root:mediamtx 0640), not in the bundle. Rotating it means
  rerunning the installer and editing `api.env`.
- One relay path maps to one robot (`QuestRelay:RobotCode`), as today. A second robot needs a second path.
- The reaper's check depends on MediaMTX reporting `query` for WebRTC sessions in `/v3/webrtcsessions/list`. If the
  installed release does not, the reaper kicks nobody and an open picture lasts until the viewer leaves or reconnects
  (a reconnect needs a fresh token, which is refused); the hardware test checks it.
- The relay calls the API through its public name (`https://api.<domain>`), so the EC2 host must reach its own
  Elastic IP on 443.
- Same single-API-instance limit as Fleet Sync and the camera lease (ADR-0019, ADR-0052): leases live in memory.
- The relay's own LAN mode on the NUC (`robot/quest-stream`, MediaMTX with `user: any` on the LAN) is unchanged; it
  is not reachable from the Internet.
