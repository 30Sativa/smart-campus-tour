# Visitor redesign and SRS coverage

Reference: FA26SE184 SRS CampusTour DT-AMR v0.1, supplied PDF.

## Design

Preserve Home branding: cyan accent, dark campus imagery, existing font stack,
rounded controls, light/dark theme. The visitor catalog uses a shorter photo hero,
searchable route cards, duration filters, and mobile bottom navigation.
Existing URL paths and booking API contracts are unchanged.

## Visitor flows

| SRS flow | Screen | Existing integration and limit |
| --- | --- | --- |
| UC-01, route and POI discovery | /tours, /tours/:id | Existing routes API; redesigned catalog and ordered itinerary. Search matches names, descriptions and POIs, including Vietnamese queries without accents. |
| UC-01, time slot and booking | /tours/:id/book | Existing slots and booking API; shared controls and theme updated. |
| UC-02, booking status | /my-bookings | Existing bookings API. Active state is currently inferred from time, not authoritative robot/session telemetry. |
| UC-02, live tour | /live-tour/:id | Existing simulated progression is explicitly labeled. Real telemetry is still an integration requirement. |
| UC-03, AI interaction | /ai-guide | Existing simulated text/voice flow is explicitly labeled. Actual AI service, Web Speech API, language selection, error states and answer reporting remain integration work. |
| Feedback after tour | /feedback/:id | Existing feedback API; shared controls and theme updated. |
| Visitor profile | /profile | Existing read-only profile. Profile editing and language settings remain implementation work. |

This UI change does not claim complete SRS compliance. PWA installation/offline
support, authoritative session status, cancellation/rescheduling workflows and
the missing integrations above must be verified separately before acceptance.

## Verification

Run scripts/verify web from the repository root.
Behavior tests cover API loading/error/empty states, Vietnamese search, combined
filters, the 30-minute boundary, POI counting, sorted itinerary and booking links.
Inspect desktop/mobile and both themes in a browser as well.
