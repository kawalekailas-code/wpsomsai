# Local verification report

Verified for this delivered source on 9 November 2026. Base repository: `kawalekailas-code/wpsomsai`, original commit `a62146ac432abd03ee17de10d7f3feb013b89d37`. Current v2.1 contacts work is on local branch `contacts-management`; no commit, push or production deployment was performed by the assistant. The uploaded personal-chat base is `1f20f6544e27c893e8fb4b5b35a2a145b8f4abb2`.

## Results

| Check | Result |
| --- | --- |
| Backend integration/migration tests | **35 / 35 passed** |
| Frontend helper/unit tests | **26 / 26 passed** |
| Chromium desktop/mobile browser tests | **11 / 11 passed** |
| Production frontend build | Passed |
| `git diff --check` | Passed |
| Production dependency audits | Backend **0**, frontend **0** known vulnerabilities reported |
| Package/lockfile root metadata | Both agree |
| Migration CLI `--help` | Passed without credentials or a database |

Runtime used: Node 20.20.2, npm 10.8.2, Linux. Backend dependencies require Node >=20.19; Render configuration recommends Node 22. Audits are a point-in-time dependency check, **not** an independent security audit.

## What the backend tests actually exercise

A disposable MongoDB is started locally and removed after tests. Meta HTTP endpoints are mocked; there are no real WhatsApp sends. Coverage includes:

- Authentication, safe profile serialization, first-account registration lock and removal of marketing routes/public uploads.
- Indian/international phone normalization, allowed preference updates and per-user chat organization.
- Native reply payloads and client-ID send deduplication.
- The 24-hour free-form restriction and approved-template payload shape.
- Raw-byte HMAC webhook verification and duplicate incoming-message handling.
- Monotonic/out-of-order/concurrent delivery receipts, including early receipts arriving before the send response.
- Per-user stars, delete-for-me, clear history, search/export visibility, stable cursor pagination and around-message navigation.
- Native reactions, contact cards and location payloads.
- Real byte-type checking, authenticated media proxying and temporary-file cleanup.
- **Actual FFmpeg conversion** into OGG/Opus before mocked upload—not a renamed WebM file.
- Password changes revoking JWTs/admin-registration permission.
- Socket.IO HTTP polling handshake on the same Express/HTTP server, authenticated private room delivery and no duplicate HTTP request listeners.
- Legacy media dry-run safety, index/data/TTL preservation, repeat-safe apply and upload-failure behavior. Apply tests use a fake upload function and temporary files.

## What the browser tests exercise

The frontend runs in its explicitly labeled, fictional demo mode. Tests also assert no `/api` or Meta send requests in the main desktop scenario. React StrictMode is enabled in development.

1. Send text, quote/reply, react, star, navigate from starred messages and jump to latest.
2. Shared workspace note, mute, media gallery, photo viewer keyboard focus/Tab/Escape/return focus, theme/wallpaper/font size and saved quick replies.
3. Document selection/caption/send, location coordinates and contact sharing.
4. Actual browser MediaRecorder start/stop/review/send with a synthetic test microphone. This does not validate a real microphone or live Meta delivery.
5. Forward to another chat, search, text export and delete-for-me.
6. Mobile width 390×844: no horizontal overflow, message-menu reactions, back navigation, archive/filter, closed-window composer disabled, template send with the window correctly remaining closed.

Desktop/mobile screenshots were inspected. Browser tests use Chromium, not a comprehensive Safari/Firefox/device matrix. The production bundle compiled successfully; real-host HTTPS/CORS/service-worker behavior still needs the deployment smoke test.

## Added contacts checks

Eleven new backend scenarios cover authentication, single creation/duplicate validation, explicit chat opening, book search/pagination across archived/hidden chats, read-only import preview, skip/update/restore behavior, concurrent imports, shared removal without message loss, spreadsheet-safe UTF-8 exports and incoming unsaved senders. No contact import calls Meta or fabricates `lastInboundAt`.

Fifteen new frontend unit scenarios cover CSV/Google CSV/UTF-8/quoted text, malformed/oversized files, folded and quoted-printable vCards, multi-number cards, structured names, country-code normalization, safe CSV round-trips and persistent demo management.

Five new Chromium scenarios cover add/search/edit/export/open-chat, CSV preview/validation/import/reload, VCF multiple phones and opt-in updates, selected export/removal/cancel/history preservation, and mobile single creation/import/navigation/no horizontal overflow. They run alongside the six existing chat scenarios.

Contacts and phone parsing are lazy-loaded; the main production JavaScript bundle remains below 500 KB minified. Parser chunks are fetched when Contacts is used. Vite prebundles the parser dependencies at startup to prevent a first-click dev-server reload.

## Deliberately not claimed

- No live Meta token, user number, WABA permissions, approved-template catalog or actual phone delivery was verified.
- No live Atlas/Render resources, secrets, webhook settings or existing database records were changed.
- No recovery of previously lost Render files or already expired Meta attachments.
- No full personal WhatsApp parity, personal QR account login, end-to-end encryption of this app's database, permanent media retention or always-on free hosting.

See [deployment and live smoke-test checklist](DEPLOYMENT.md) before updating your real services.
