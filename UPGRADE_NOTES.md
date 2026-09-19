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

## Phase 2 moderation upgrade
- User Report, Block and Unblock APIs.
- Blocked users cannot start or continue private messages with each other.
- Admin dashboard no longer loads private conversation/message content.
- Admin user table now shows profile image, status, join date and moderation actions.
- Admin can suspend, restore/unblock and soft-delete accounts.
- Admin reports queue supports reviewed, resolved and dismissed states.
- Existing MySQL deployments must run `database/phase2-moderation.sql` once before using these features.


## Phase 4 — optional meeting summaries
- Final live-transcript lines are saved to the meeting record.
- Meeting participants can reload the saved transcript.
- Participants can optionally generate and save a concise meeting summary.
- Summary output includes overview, key points, decisions, action items and suggestions.
- Summary language can be English, Hindi or Marathi.
- Saved meeting summaries appear on the Summaries page and can be deleted by participants.
- Saved transcripts can be deleted independently of existing summaries.
- Run `database/phase4-meeting-summary.sql` once on an existing MySQL deployment.
- If `OPENAI_API_KEY` is configured, Connect uses the AI summary path. Without it, Connect uses a local fallback summarizer.

## Final pre-deployment UX/auth fixes
- Password minimum reduced from 12 to 8 characters while retaining uppercase, lowercase, number, and symbol requirements.
- Forgot-password UI now confirms the new password; reset emails continue to target the registered account email (SMTP_USER remains sender only).
- Added emoji picker to private/group chat composer.
- Added separate Audio Call and Video Call actions on desktop; on phone these actions live under the three-dot menu.
- Enlarged responsive meeting/video stage.
- Improved screen sharing: explicit unsupported/cancelled status, local share preview, stop-sharing control, and camera restoration after sharing ends.
- Added audio-only meeting mode (`?mode=audio`) with microphone-only media capture.

## Phase 5 — Notifications and read receipts
- Real-time alert sound for new messages, incoming friend requests, and accepted requests (user can disable it in Settings).
- Mobile hamburger menu shows total unread badge; Messages and Requests show category counts.
- Persistent message receipt table tracks Sent, Delivered, and Read states.
- Sender sees ✓ for sent, ✓✓ for delivered, and highlighted ✓✓ for read.
- Run `database/phase5-notifications-receipts.sql` once on an existing database before starting this build.

## Meeting reliability fix
- WebRTC peers now reserve audio/video transceivers, so screen sharing works even if the sharing PC has no webcam.
- Remote media is assembled track-by-track instead of assuming a single incoming MediaStream.
- New server-side chunked transcription endpoint uses OpenAI speech-to-text when `OPENAI_API_KEY` is configured.
- Browser speech recognition remains a fallback when AI transcription is not configured.
- Meeting summary errors now explain when no saved transcript exists.

## Reliability update 2
- Microphone acquisition now requests audio independently from camera and retries microphone access when transcription starts.
- Screen-share video uses contain scaling so the entire shared desktop remains visible.
- Meeting tiles receive participant usernames instead of the generic Participant label.
- Added Leave Call for everyone and host-only End Call / End Meeting.
- Opening a conversation now marks that conversation's message notifications read, allowing mobile unread badges to clear to zero.
- Existing groups now have Group Info with member list, admin add/remove controls, and Leave Group.


## Reliability repair 2026-09
- Restored host End Call/End Meeting and participant Leave Call controls after a transcription-only patch regression.
- Restored actual participant usernames/profile labels in meeting tiles and signaling.
- Normalized MediaRecorder MIME types before upload, lengthened audio segments, and added Whisper fallback for transcription compatibility.
- If server transcription fails but browser SpeechRecognition is available, Connect automatically switches to browser live transcription instead of stopping.
