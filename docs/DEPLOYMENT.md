# Deploy/update the existing services — v2.3

Current deliverable: **`omsai-incoming-sender-v2.3-source.zip`**, a full source snapshot adding the read-only admin System Usage Dashboard to personal chat, Contacts, Incoming Safety and the approved admin Template Sender. The historical `omsai-incoming-sender-v2.2-source.zip` remains unchanged; **do not overwrite it.** Old v2.0/v2.1 patch files target earlier commits and must not be forced over this version.

This code has not been pushed/deployed by the assistant. No real messages were sent and no production database records, secrets, webhook subscriptions or hosting settings were changed.

This code has not been pushed/deployed by the assistant. No real messages were sent and no production database records, secrets, webhook subscriptions or hosting settings were changed.

## 1. Back up and update source together

- Privately back up the current MongoDB database and save the previous working source/commit. Do not upload a dump or `.env` to GitHub.
- Rescue any existing Render runtime uploads before redeploy; an ephemeral filesystem is not a backup. Download important Meta media separately before it expires.
- Extract the ZIP, open its `wpsomsai` folder, and put its **contents at repository root** (`backend`, `frontend`, `docs`, root package/config files). Do not accidentally add a nested `wpsomsai` folder.
- Update backend and frontend together, including **both package + lockfile pairs**. Keep `.gitignore` and the examples, not actual credentials. Dependencies/builds/runtime uploads are deliberately excluded from the ZIP.
- If updating the already deployed v2.1 source, this is an additive sender/safety update—no database reset or destructive cleanup. If returning to the original pre-personal-chat source, note that old `frontend/src/App.js`, `frontend/src/index.js`, `frontend/public/index.html`, Campaign/Template/Reminder models and AI/marketing route files were removed; copying a ZIP on top does not delete obsolete files automatically.
- Review/commit/push with your own GitHub login. Update the **two existing Render services in place** to the same chosen source commit. `render.yaml` is only an optional fresh-service blueprint, not a reason to create duplicates.

The ZIP contains a source manifest for integrity checking. It does not contain Git history, private credentials, dependency trees, generated build files, test artifacts or attachment binaries.

## 2. Backend — keep the same Web Service and database

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/health` |
| Node | 22 recommended (minimum 20.19) |

Preserve your existing `MONGO_URI`, `TOKEN`, `PHONE_ID`, strong `JWT_SECRET`, `VERIFY_TOKEN`, `APP_SECRET` and `FRONTEND_URL`. The app secret is required for original-byte webhook HMAC verification; it is not the verify token or access token. Rotating JWT_SECRET invalidates sessions; password changes also revoke old sessions.

- `FRONTEND_URL`: exact frontend origin, no trailing slash; comma-separated origins supported. It controls HTTP/Socket.IO CORS.
- `WHATSAPP_API_VERSION`: a currently supported Graph version enabled for your app; supplied default `v25.0`.
- Existing database: **`ALLOW_FIRST_USER_SETUP=false`**, no public re-registration. New empty database only: temporarily enable with a strong private `SETUP_KEY`, create the first admin, then disable/remove it.
- Optional `FFMPEG_PATH` overrides the supplied FFmpeg binary; `DISPLAY_PHONE_NUMBER` is display only.

New sender settings (backend only):

```text
WABA_ID=your own WhatsApp Business Account ID
SENDER_ENABLED=false
SENDER_MAX_RECIPIENTS=5000
SENDER_GAP_MS=1000
STORAGE_LIMIT_MB=512
```

Do not copy the explanatory WABA_ID text literally. Use your private account's real ID. Leave sending disabled until controlled live inbound/status checks pass. **Incoming journal recovery does not require enabling sending.** Preview/catalog requires WABA_ID; Incoming Safety itself can be used without it. The sending switch gates the new queue, not existing manual chat actions.

## 3. Frontend — keep the same Static Site

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Publish directory | `build` |
| `REACT_APP_API` | Existing backend **origin**, without `/api` or trailing slash |
| `VITE_DEMO_MODE` | `false` for production |

`VITE_API_URL` is an alternative to `REACT_APP_API`; the old variable remains supported. These are build-time values. Never place Meta tokens/app secrets/JWT/Mongo credentials into any frontend variable. Keep the SPA rewrite `/*` → `/index.html` and `Cache-Control: no-cache` for `/sw.js`.

The service-worker shell cache is **v5**; private API/media/history/tokens are not cached. Update both services and reload once; if an old installed tab remains open, close/reopen it. Backend/UI compatibility is more important than independently deploying only one side.

## 4. Preserve the existing Meta webhook

Keep `https://YOUR-EXISTING-BACKEND/webhook` and the `messages` subscription on the same configured app/number. Use the existing actual backend origin, not that illustrative address. Confirm APP_SECRET and VERIFY_TOKEN belong to that app. **Do not change the callback to the old `htmlwp` sender or add a competing second webhook.** Both senders use the same WhatsApp number; stop the old one during controlled tests/new-queue use to avoid overlapping sends and app-external suppression bypass.

## 5. Controlled live smoke test — only with your own consenting test contact

These are steps **for you after deployment**, not actions already performed by the assistant:

1. `/health` returns success; root `/` reports version `2.3.0` after deployment. Sign in with an existing admin and confirm existing history/Contacts/settings. Keep queue disabled initially.
2. Send one incoming text **from your test contact** to the configured Cloud API number. Confirm normal chat storage, Incoming Safety observation time and the 24-hour window. Seeing a green health check alone does not prove webhook completeness.
3. Briefly disconnect the browser, arrange another inbound from the test contact, then reconnect/foreground or use **Sync stored messages**. Confirm it appears once; check an around-search window does not silently jump/mark unseen incoming read.
4. Reply/quote/react and check **actual** delivered/read callbacks. Test a small photo/document and a short voice note if needed; browser microphone requires HTTPS/permission. Do not send uninvolved contacts a test.
5. Open Incoming Safety. Investigate failed/unreviewed events, private original payloads, available stats and Atlas usage. A BSUID-only event stays reviewable, not a fabricated phone chat. Resolve the actual issue before clearing a warning.
6. Check the approved catalog using the real WABA_ID/language. With verified opt-in and understood charges, enable `SENDER_ENABLED=true` and queue **one** test recipient—not 1,000 real contacts. Confirm actual API ID, delivery and any opaque callback echo; live echo/timing was not verified locally.
7. Check pause/cancel semantics with a small **consented** test only if necessary: a request already in flight can finish. An uncertain result must not be resent blindly. Stopping the browser does not cancel a saved job, and free-host sleep can suspend execution.
8. In a closed-window chat, free-form sends remain blocked; approved templates do not open the reply window until the recipient messages you. Suppressed recipients must not receive templates through this app.

The 1,000-recipient local mocked test is a correctness/recovery check with an accelerated schedule. It is not live delivery proof, an account quota check or a promised production speed. Meta charges/opt-in/quality/messaging limits still apply.

### Dashboard after deployment (read-only, admin-only)

The dashboard becomes observable only after you deploy this backend and sign in as an admin. **Do not ask the assistant for current production CPU/RAM/storage numbers:** Render Free shared hours/billing, Atlas cluster-wide quota/billing, and Meta account-level limits are unavailable from this app and were not measured. Unknown cgroup quotas/database stats are shown as unavailable, not `0%` of an assumed plan.

## 6. Rollback and storage precautions

Pause/cancel saved outgoing work before an upgrade or rollback. Set `SENDER_ENABLED=false` first if you do not want queued work to resume after a restart; turning it off does not unsend an in-flight request. Keep the database and previous source backup, and roll back **both** services together.

No database migration drops collections on startup. New technical models/indexes are additive; existing users/history/per-user state and the 30-day Message TTL remain. Old campaign/reminder/template collections are not dropped. An older backend will not understand/drain the new journal/jobs—do not assume a rollback preserves the new recovery feature. Do not remove unresolved/uncertain records casually.

Atlas 512 MB includes data/indexes and other retained collections. The UI's `dbStats` budget is for this database; Atlas is authoritative. Outgoing holds at 90%/unknown stats do not guarantee there is space for incoming. Delete-for-me/acknowledge are not storage cleanup. Export needed reports privately, review storage early and choose any destructive cleanup only after your own backup/approval.

Processed journal fragments expire after 24 hours, completed/cancelled reports without uncertainty after roughly seven days, upload metadata after 29 days, and normal chat history after 30 days. Unresolved journal/uncertain queue work is not silently expired. Nothing here is a permanent media archive or absolute zero-loss/uptime guarantee.

## Legacy local attachments

Only if old local files still exist, privately restore them and inspect:

```bash
cd backend
npm run migrate:media
# Dry run by default. Only after private backup/review:
npm run migrate:media -- --apply
```

`LEGACY_UPLOAD_DIR` points to a private restored directory. The helper does not recover erased files, delete originals or reset Message TTL. Its apply tests use mocked uploads; real migration is not performed in this delivery.

See [v2.2 operating guide](INCOMING-SENDER-UPDATE.md) and [verification report](VERIFICATION.md).
