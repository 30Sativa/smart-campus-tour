# ADR-0064: Each account may set its own avatar picture

- **Status:** Proposed 18/11/2026; implemented in code with schema v1.24. Needs the repository owner's acceptance and a
  check with a real Cloudinary account.
- **Related:** ADR-0063 (Cloudinary signed uploads), the self-service profile (`/api/account/me`).

## Decision

1. **Storage.** `Users.AvatarUrl NVARCHAR(1000) NULL` with `CK_Users_AvatarUrlHttps` (schema v1.24, additive patch
   `upgrade-v1.23-to-v1.24-user-avatar.sql`). The picture itself is a public Cloudinary image; the column keeps
   `https://res.cloudinary.com/{cloud}/image/upload/smartcampus/avatars/{userId:N}/{uploadId:N}`.
2. **Upload.** `POST /api/account/me/avatar-upload` signs one upload for the token's own account: a fresh public ID under
   that account's folder, `allowed_formats` for photos (HEIC included), and the incoming transformation
   `c_limit,h_1024,w_1024` so Cloudinary stores at most 1024 px. The browser sends the file straight to Cloudinary;
   the API never handles it and the secret never leaves the API.
3. **Saving.** `PUT /api/account/me/avatar` with `{avatarUrl}` accepts only a reference that matches this account's own
   folder in the configured cloud, or `null` to remove it; anything else is 400. Audited as `AVATAR_UPDATED` /
   `AVATAR_REMOVED`. Every role (Admin, Staff, Technical Staff, Representative) has it, for its own account only.
4. **Showing.** The profile card and the console header show the picture through Cloudinary
   (`c_fill,g_face`, twice the CSS size, `f_auto,q_auto`); without one, or if it fails to load, the initials stay.

## Consequences

- A fresh public ID per upload means no CDN purge and no overwrite; a replaced or removed picture stays on Cloudinary
  (small; delete in the Media Library if needed).
- Avatars are public images: anyone with the URL can see them. They are profile pictures, not sensitive media.
- The deploy upgrades a v1.23 database by itself before the new API starts (`upgrade-db-schema-ec2.sh --if-needed`,
  with a backup first); the runtime already had UPDATE on `dbo.Users`, so grants do not change.
