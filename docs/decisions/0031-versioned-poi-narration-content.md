# ADR-0031: Narration content on versioned POI revisions

- Status: owner-authorized Part 1 of the versioned POI → Route → Tour sequence
- Date: 2026-10-29
- Related: ADR-0021, ADR-0023, ADR-0024

## Decision

Versioned POI revisions store required narration text (up to 4000 characters)
and an optional HTTPS fallback video URL (up to 2048 characters). Existing
revision rows stay nullable for additive-upgrade compatibility; a revision
without narration cannot be submitted and returns `409 POI_NARRATION_REQUIRED`.
Staff supplies content while creating or revising a draft. Technical Staff sees
it read-only while recording manual verification and cannot edit it.

Narration and fallback video are content, not navigation configuration. They
are excluded from `PoiNavigationFingerprint`; a content-only revision reuses
the effective result for the same navigation fingerprint, while map, pose or
camera changes still require verification. `RouteRevisionStops` snapshots both
fields when the route revision is saved so a later route reader can use the
content selected at that time.

The additive Database First change is schema v1.7. The v1.6 snapshot remains
immutable. No audio approval, generated narration, configured tour duration,
scheduling, READY or Tour runtime is added by this decision.
