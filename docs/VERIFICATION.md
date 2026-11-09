# Local verification report

Verified for this delivered source on 9 November 2026. Base repository: `kawalekailas-code/wpsomsai`, original commit `a62146ac432abd03ee17de10d7f3feb013b89d37`. Work is on local branch `personal-chat`; no commit, push or production deployment was performed.

## Results

| Check | Result |
| --- | --- |
| Backend integration/migration tests | **24 / 24 passed** |
| Frontend helper/unit tests | **11 / 11 passed** |
| Chromium desktop/mobile browser tests | **6 / 6 passed** |
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

## Deliberately not claimed

- No live Meta token, user number, WABA permissions, approved-template catalog or actual phone delivery was verified.
- No live Atlas/Render resources, secrets, webhook settings or existing database records were changed.
- No recovery of previously lost Render files or already expired Meta attachments.
- No full personal WhatsApp parity, personal QR account login, end-to-end encryption of this app's database, permanent media retention or always-on free hosting.

See [deployment and live smoke-test checklist](DEPLOYMENT.md) before updating your real services.
