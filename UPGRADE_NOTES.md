# Connect upgrade notes

Implemented in this build:

- Renamed all project branding to **Connect**.
- Strong password policy (12+ chars, uppercase, lowercase, number, symbol).
- Password reset rejects reuse of the current password.
- Password reset code is sent by email through Resend; it is no longer returned to the website.
- Email domain MX validation during signup.
- Group conversations with multiple accepted connections.
- Group WebRTC meeting mesh for multiple participants.
- STUN + configurable TURN support for calls across different networks.
- Download action for received images.
- AI summary integration through OpenAI API with a concise local fallback.
- Admin login defaults updated and production password is no longer printed to server logs.

## Production environment variables to add

RESEND_API_KEY, EMAIL_FROM, TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL, OPENAI_API_KEY, OPENAI_MODEL, ADMIN_EMAIL, ADMIN_PASSWORD.

## Important

This build changes the default MySQL database name to `connect`. If your deployed Railway database currently uses another database name, either keep your existing `MYSQL_DATABASE` environment variable (recommended to preserve existing data) or import `database/schema.sql` into a new `connect` database. The internal database name does not affect the public project branding.

For large group video rooms, a WebRTC mesh is not the final scaling architecture. Use an SFU (for example LiveKit or mediasoup) when you need larger rooms.


## Chat & group meeting update
- The chat sidebar now always shows existing conversations and accepted connections that do not yet have a conversation.
- Users can switch among multiple private/group conversations without losing history.
- Every active chat now has a Start video call / Start group meeting button.
- Group meeting links use a deterministic room tied to the conversation (`chat-<conversationId>`), so group members can join the same room.
- The current group meeting implementation is WebRTC mesh. TURN is still required for reliable cross-network connectivity; for large production meetings, migrate to an SFU.
