# OmSai Chat — personal-style edition v2.1

A chat-focused rebuild of `kawalekailas-code/wpsomsai`. The existing **official WhatsApp Cloud API** connection is retained. This is **not** a QR-login client for a personal WhatsApp account.

## New: Contacts upload & management

**Contacts → Add contact / Import contacts** now provides a complete shared workspace address book: single-contact creation, name/note editing, name/number/note search, paginated browsing, CSV/VCF preview/import, duplicate checks, selected CSV export and confirmed contact removal without deleting chats. Bulk imports never send messages or create empty conversations.

Supports UTF-8 CSV and common vCards, up to **512 KB / 500 phone entries** per file. Default is skip existing numbers; opt-in updates preserve blank fields. [Contacts usage and upload/deploy instructions](docs/CONTACTS-UPDATE.md).

## Kay badalla?

**Broadcast, Pipeline ani Marketing modules frontend + backend donhikadun kadhle aahet.** Lead labels, campaign/template database models, scheduled auto-send reminders and the unused AI routes have also been removed from the active app. No database collections are dropped automatically.

### Chat features

| Feature | What it actually does |
| --- | --- |
| Text, emoji, basic WhatsApp formatting | Sends through Cloud API; React safely escapes message text. |
| Quoted replies | Uses the original WhatsApp `context.message_id`. Legacy messages without an API ID cannot receive native replies. |
| Reactions | Sends/removes a native emoji reaction; handles incoming reactions. Available from message menus on mobile too. |
| Forward | Sends a **new copy to one selected chat**. The destination needs an open reply window. It does not create WhatsApp's native forwarded marker. |
| Photos, video, documents, audio, stickers | Supported file formats only; app upload/download limit 16 MB, photos 5 MB, static WebP stickers 100 KB. Files are byte-type checked. |
| Voice notes | Browser recording, review/cancel, maximum two minutes; the server really converts recordings to mono OGG/Opus with FFmpeg before sending. |
| Location and contact cards | Native Cloud API location/contact messages. Browser location requires explicit permission; manual coordinates work too. No live tracking. |
| Delivery/read/played/failed information | Stored from Meta webhooks using actual message IDs. Missing timestamps are not fabricated. |
| Search, stars, media/files/links gallery | Search within one chat or across visible history; pagination and navigation back to the original message. |
| Pin, archive, mute, unread | **Per-user settings inside this app**. They do not alter a personal WhatsApp client's settings. |
| Delete for me, clear chat, remove chat | Hides history for that workspace user. Does **not** unsend messages or remove them from the recipient's phone. |
| Contact names/notes, profile text | Names/notes are shared with authorized workspace users; not edits to WhatsApp account profiles. |
| Quick replies and drafts | Editable saved replies insert a draft; they never automatically send. Drafts are kept in this browser and removed on sign-out. |
| Theme, wallpaper, font size | Light/dark/system, four wallpaper choices, message sizing. |
| Notifications | Opt-in browser notification permission; no message text in desktop notification bodies. Muted chats remain quiet. Background delivery is not guaranteed after the app/browser closes. |
| Export and installation | Export app-visible chat text without attachment binaries; PWA installation and a public-shell-only cache. No offline sending. |

### Intentionally not included

Personal-number QR login, personal WhatsApp history/contact sync, groups/communities, Status stories, personal voice/video calls, online/last-seen/typing presence, native message edit/unsend, live location, view-once messages, payments and native disappearing-message settings are **not implemented**. There are no fake working buttons for them. Some business APIs have separate capabilities, but they are not a personal-account replacement.

## Render + MongoDB 512 MB

- MongoDB stores text and metadata—not attachment binaries or base64 files. The 512 MB Atlas Free allowance includes indexes as well as data. [1](https://www.mongodb.com/docs/atlas/manage-clusters/)
- The original **30-day message TTL** is retained, including for starred messages. TTL cleanup is asynchronous, not immediate at the exact expiry second.
- Messages load in pages of 50; contacts in pages of 40; gallery in pages of 12. Indexes support the chat and receipt lookups. Connection pool is capped at ten.
- Media is uploaded to Meta, then temporary server files are deleted. Downloads are authenticated and resolve a fresh media URL; `/uploads` is no longer publicly served.
- **Incoming media IDs can expire after 7 days; uploaded media after 30 days.** Download important files before expiry. A media ID is not a permanent backup. [3](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media)
- Render Free can sleep when idle and can restart. No scheduler, bulk sender, Redis, browser automation or always-running background worker is required. A reconnect/cold start is still possible; this is not a production-uptime guarantee. See https://render.com/docs/free.
- Hosting being free does not make WhatsApp messages/templates free. The app enforces Meta's 24-hour reply window and a **per-chat approved-template dialog** for starting/reopening conversations. This is not the removed marketing module. [1](https://business.whatsapp.com/policy)

## Important before updating your existing deployment

1. **Back up the current MongoDB data and any surviving local uploads first.** Redeploying Render can erase runtime files.
2. Replace the frontend **and** backend together; the contacts/messages API responses have changed.
3. Existing users/passwords and text messages are retained. Existing users can sign in normally. Keep `ALLOW_FIRST_USER_SETUP=false` when an account already exists.
4. Preserve your existing backend `MONGO_URI`, `TOKEN`, `PHONE_ID`, `JWT_SECRET`, `VERIFY_TOKEN` and `FRONTEND_URL` values. **`APP_SECRET` is now mandatory**: set the Meta app secret from your own Meta app dashboard. Never put these secrets in frontend variables or Git.
5. `JWT_SECRET` must be at least 32 characters. Rotating it requires signing in again. Password changes also invalidate existing sessions.
6. Set a currently supported `WHATSAPP_API_VERSION` enabled for your Meta app; the supplied default is `v25.0`. The webhook callback remains `/webhook` with the `messages` subscription.
7. Old locally stored attachments without a `mediaId` do not magically become durable. Migrate them **while the old files still exist**, or download/back them up elsewhere. See the migration helper below.
8. Legacy campaign/template/reminder collections are left untouched. After backup, you can manually remove old collections in Atlas if you no longer need their data and want to reclaim space. The app will not erase them for you.

### Existing Render service settings

**Backend — Web Service**

```text
Root Directory: backend
Build Command: npm ci --omit=dev
Start Command: npm start
Health Check: /health
```

Use Node **22** (minimum supported Node 20.19). Copy the variable names from `backend/.env.example`; fill them privately in Render. Set `FRONTEND_URL` to the exact frontend origin, without a trailing slash. Comma-separated origins are supported.

**Frontend — Static Site**

```text
Root Directory: frontend
Build Command: npm ci && npm run build
Publish Directory: build
```

The frontend moved from Create React App to Vite, but **the publish folder remains `build`** and **your existing `REACT_APP_API` variable is still supported**. Set it to the backend origin, without `/api`. Set `VITE_DEMO_MODE=false`. Frontend environment changes require a rebuild. `render.yaml` is an optional blueprint for fresh services; do not create duplicate services if you are simply updating existing ones.

### First account on a NEW database only

Privately set `ALLOW_FIRST_USER_SETUP=true` and a strong one-time `SETUP_KEY` in the backend. Open the frontend, create the first account using that key, then set `ALLOW_FIRST_USER_SETUP=false` and remove the key. Public registration is otherwise locked. Never use demonstration passwords or keys in production.

### Legacy media helper

```bash
cd backend
# .env must contain your own private backend values.
# Default is a DRY RUN. Does not upload or alter messages:
npm run migrate:media
# Only after backup, while the old uploads directory still exists:
npm run migrate:media -- --apply
```

`LEGACY_UPLOAD_DIR` can point to a restored private uploads directory. Migration does not recover already-lost files, does not delete originals, and does not reset the message's 30-day TTL. Meta-uploaded copies are still temporary.

## Local development

```bash
cd backend
npm ci
# Copy .env.example to .env and fill it privately.
npm start
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

The browser uses relative `/api`, `/auth` and Socket.IO requests in local development; Vite proxies them server-side to port 3000. No browser code calls a sandbox localhost backend. For a separate deployed API, use `REACT_APP_API` / `VITE_API_URL`.

### Safe interactive demo

Open the frontend and select **Explore interactive demo**. The demo uses fictional browser-local data, visibly labels itself, and **never calls the real WhatsApp API**. For an explicit preview-only deployment, set `VITE_DEMO_MODE=true`. Do not enable it accidentally on a real production deployment. Demo attachments larger than 1 MB are session-only and do not survive a reload.

## Delivery and deployment guides

- [Update existing GitHub/Render services, migration and rollback](docs/DEPLOYMENT.md)
- [Verified test results and what has not been tested live](docs/VERIFICATION.md)
- [Contacts import, management and v2.1 update instructions](docs/CONTACTS-UPDATE.md)

## Tests

```bash
# At project root, after installing both dependency sets:
npm test
npm run build

# Browser tests (no real WhatsApp messages):
cd frontend
npx playwright install --with-deps chromium
npm run test:e2e
```

Backend integration tests use a disposable local MongoDB and mocked Meta HTTP endpoints, including raw-byte webhook signatures, duplicate handling, per-user visibility, reply-window enforcement, media proxying and an actual FFmpeg voice conversion. The test MongoDB binary may be downloaded the first time. Browser tests cover desktop/mobile interactions and assert that the demo does not make API sends.

**Real WhatsApp delivery has not been tested against your account:** your private Meta credentials, number configuration, template approval, permissions and live webhooks are required for that final check.

## Security and privacy boundaries

- This remains a **single WhatsApp-number workspace**, not multi-tenant SaaS. Authorized accounts share conversations and contact notes; local stars/visibility/organization are per user. Do not give accounts to untrusted people.
- HTTP routes and Socket.IO require a valid JWT and current user. Deleted accounts are rejected; password changes invalidate old sessions. Auth tokens use the existing browser-storage approach (`localStorage`), so deploy over HTTPS and avoid untrusted scripts/extensions.
- Webhook HMAC verification is fail-closed and uses the original request bytes. Incoming IDs are unique, status updates are monotonic, and short-lived receipt records handle early delivery callbacks.
- Message rendering does not inject HTML. Links are user-opened; there is no arbitrary URL fetching/link-preview service.
- API/media responses are not put into the service worker cache. This app does **not** claim that MongoDB chat storage is end-to-end encrypted.
- A client message ID deduplicates repeated send requests, but **exactly-once network delivery is not guaranteed**. Ambiguous timeouts are not automatically retried. Check the recipient before manually retrying.

## Project layout

```text
backend/  Express API, MongoDB models, Meta API adapter, authenticated media proxy
frontend/ React UI, API/demo adapters, responsive styles, PWA shell, browser tests
render.yaml  Optional deployment blueprint
```

This **v2.1 contacts update is local** to the delivered project. It has not been pushed to GitHub or deployed by the assistant, and no live database records were changed. The previous personal-chat source was uploaded by you; upload and deploy this updated frontend/backend together.
