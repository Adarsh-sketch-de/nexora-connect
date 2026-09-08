# Connect — Functional MVP v2

This is a working development build of the communication platform. It is deliberately different from the earlier UI-only prototype.

## What works now

- Create account with username, email and password
- Login with username or email
- Password hashing with bcrypt
- Forgot-password 6-digit reset flow
  - Works immediately in development mode by showing/printing the code
  - Development reset codes work immediately; production email delivery still needs a mail provider integration
- User profile and local profile-image upload
- Search users
- Send, accept and reject connection requests
- Persistent connection list
- Start private conversations only with accepted connections
- Real-time Socket.IO chat
- Typing indicator
- Image messages
- Conversation history
- Saved summaries with key points, decisions, action items and suggestions
- Notifications
- Basic WebRTC camera/microphone meeting room and screen sharing
- Admin login, user statistics and auditable conversation-review view
- 20 actual page routes
- Local persistent JSON database by default
- Optional real MySQL storage mode

## Quick start — easiest mode

1. Extract the project.
2. Open Command Prompt in the project folder.
3. Run:

```cmd
npm install
npm start
```

4. Open:

```text
http://localhost:3000
```

The default storage mode is `local`, so you can test the site without installing MySQL first. Data is saved in `data/db.json`.

## Test the connection/chat workflow

1. Create Account A.
2. Open an Incognito/Private browser window and create Account B.
3. Complete the profiles.
4. Account A: Discover -> search Account B -> Add connection.
5. Account B: Requests -> Accept.
6. Either user: Messages -> start the conversation.
7. Type messages or attach an image.
8. Click **Generate summary** after sending a few messages.

## Test a meeting

Sign in as two users in separate browser sessions, open **Meeting Room** for both, use the same room ID, grant camera/microphone permission, and join.

For internet-wide production reliability, configure a TURN server. A public STUN server alone does not guarantee connectivity through every NAT/firewall.

## Admin

Development defaults:

```text
Email: admin@connect.local
Password: ConnectAdmin@2026!
```

Open:

```text
http://localhost:3000/admin
```

Change these credentials before deployment using `.env`.

## Enable MySQL

1. Create a MySQL server/database.
2. Run `database/schema.sql` in MySQL.
3. Copy `.env.example` to `.env`.
4. Set:

```env
DB_MODE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=YOUR_PASSWORD
MYSQL_DATABASE=connect
SESSION_SECRET=YOUR_LONG_RANDOM_SECRET
```

5. Restart with `npm start`.

## Enable real email reset codes

The reset workflow itself is functional. In this development build, the code is displayed on the reset page and printed in the terminal. Before production, connect a transactional email provider so the exact same code is delivered to the user by email.

## Google login

Google sign-in is **not faked**. A real Google OAuth implementation requires a Google Cloud OAuth client ID/secret and approved redirect URI. The current UI tells users this rather than pretending the feature works.

## Production work still required

This is a functional MVP, not a production-secure WhatsApp replacement. Before public deployment, add a production session store, HTTPS, CSRF protection, rate limits, malware/file scanning, object storage, image moderation, TURN infrastructure, real OAuth, email verification, backup/restore, observability, privacy retention/deletion workflows, and legal review of Terms/Privacy documents.

## Node version

The code avoids the Express 5 `app.get('*')` wildcard issue you encountered. It is designed to run on current Node.js versions, including your Node.js 24 installation.


## Connect production upgrades

- Group chat supports the account owner plus multiple accepted connections.
- Group video uses a small-room WebRTC mesh. Configure TURN for cross-network reliability. For large meetings, migrate to an SFU such as LiveKit/mediasoup.
- Password reset codes are emailed through Resend and are never returned to the browser.
- Passwords require 12+ characters with upper/lowercase, number and symbol; password resets reject reuse of the current password.
- Shared images include a download action. For Railway production, move uploads to object storage because local filesystem storage is ephemeral.
- AI summaries use OPENAI_API_KEY when configured; otherwise a concise local fallback is used.
- Admin credentials come from ADMIN_EMAIL and ADMIN_PASSWORD. Change the example values in production.


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
