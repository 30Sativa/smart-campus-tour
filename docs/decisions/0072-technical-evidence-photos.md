# ADR-0072: Evidence photos on Technical Staff records

- **Status:** Proposed 26/11/2026 by the owner's request ("thêm phần đẩy hình ảnh để lưu bằng chứng cho technical và
  lưu trữ những hình ảnh đó trên cloudinary"). Implemented in backend (schema v1.26) and web; needs the owner's
  acceptance and a check against a real Cloudinary account.
- **Related:** ADR-0021 / ADR-0028 (map deployment check, POI verification), ADR-0034 (route test runs), the user
  avatar and fallback video uploads (same signed direct-upload pattern), `docs/architecture.md` §3.0.3.

## Context

A map deployment check, a manual POI verification and a route test run are human-entered evidence: Technical Staff
type a required note saying what they saw. A note alone is hard to review later; a photo of the localization screen,
the floor mark the robot stopped on or the route end is much better evidence. The system already uploads avatars and
fallback videos to Cloudinary with a backend signature, so no new storage provider is needed.

## Decision

1. **Optional, at most 5 photos per record.** All three records (`MapDeploymentChecks`, `PoiVerificationRecords`,
   `RouteTestRuns`) accept `evidencePhotoUrls` (0-5). The text evidence note stays required; a photo never replaces
   it. JPG, PNG, WebP or HEIC/HEIF, up to 10 MB each (the Cloudinary Free plan limit); Cloudinary stores each at most
   2048 px on its longer side.
2. **Signed direct upload.** `POST /api/technical/evidence-photo-upload` (Technical Staff) signs one upload of a new
   public ID `smartcampus/technical-evidence/{userId:N}/{random:N}`; the browser posts the file to Cloudinary, then
   sends the returned delivery URL with the record. The backend never handles the image bytes. Without Cloudinary
   configuration the endpoint returns 503 and records can still be saved with the note only.
3. **Public, hard-to-guess links.** Like avatars, the photos are public Cloudinary images; the random public ID is
   the only protection. Anyone holding a URL can view the photo. Photos must therefore show equipment and places,
   not people's faces or personal data. Signed/private delivery is out of scope.
4. **Only the checker's own uploads.** A record accepts only URLs of this cloud under the checker's own folder,
   each once; anything else is a 400 before anything is written. The backend does not check that the file still
   exists on Cloudinary.
5. **Stored with the record, immutable.** Schema v1.26 adds `EvidencePhotoUrlsJson NVARCHAR(2000) NULL` (a JSON
   array, `ISJSON` CHECK) to the three tables; null means no photos, so older rows read as before. Photos are part of
   the idempotent request: the same `requestId` with other photos is `IDEMPOTENCY_CONFLICT`, and a request without
   photos hashes exactly as before ADR-0072. Records stay append-only; a photo cannot be added or removed later.
6. **No cleanup.** An upload whose record is never saved stays on Cloudinary. Removing unused uploads is a later
   task.

## Consequences

- Reviewers see the photos in the POI verification and route test history; the web has no deployment-check history
  view yet, so those photos are returned by the API only.
- The schema moves to v1.26 with the additive patch `upgrade-v1.25-to-v1.26-technical-evidence-photos.sql`.
- Photos are evidence of what a person saw, not proof of a physical run or of READY.
