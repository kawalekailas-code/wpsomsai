# Update the existing GitHub / Render app

This delivery is local source code only. It has not been committed/pushed to GitHub, deployed to Render, connected to your private WhatsApp credentials, or run against your live MongoDB database.

## 1. Choose the source ZIP or Git patch

- `omsai-personal-chat-source.zip` contains the complete application source, lockfiles, tests, configuration examples and these instructions. It deliberately excludes dependencies, builds, Git history, secrets, test artifacts and runtime uploads.
- `omsai-personal-chat.patch` is based on original commit `a62146ac432abd03ee17de10d7f3feb013b89d37` of `kawalekailas-code/wpsomsai`. It includes file deletions as well as new/modified files.

If your checkout still matches that base, use a clean working tree and a new branch:

```bash
git switch -c personal-chat
# Adjust the patch path to the file you downloaded:
git apply --check ../omsai-personal-chat.patch
git apply ../omsai-personal-chat.patch
git status --short
npm run install:all
npm test
npm run build
```

If `--check` fails, stop and compare the current source instead of forcing the patch. Back up any existing uncommitted work first. The ZIP is a full source snapshot, not a magic updater: copying it on top of another folder does not remove old files. The old `frontend/src/App.js`, `frontend/src/index.js`, `frontend/public/index.html`, marketing/AI routes and Campaign/Template/Reminder model files were removed in this version.

After reviewing the changes, commit and push using your own GitHub login. Point both existing Render services at the chosen branch/commit. No credentials need to be shared in this conversation.

## 2. Back up before redeploying

- Export/back up your current database privately. Do not put a database dump into GitHub.
- Rescue any attachments that still exist on the old server. A Render restart/redeploy can erase runtime files.
- If you need the original filename-based attachments, restore them to a private directory and run `npm run migrate:media` from `backend` first. The default dry run does not upload, update messages or create indexes. Only `--apply` uploads eligible retained files and adds their media metadata. Original files are not deleted.
- The helper cannot recover lost files. It skips expired history, missing/oversized/unsupported files and symlinks outside the restored upload directory. Check `found`, `missing`, `skipped`, `uploaded` and `failed` counts. A failure never marks that message migrated.
- Even migrated media is temporary on Meta. Download valuable originals separately. The original 30-day message TTL is not reset.
- Old campaign/reminder/template collections are **not dropped**. Remove obsolete data in Atlas only after your own backup/review if you want to reclaim space.

## 3. Configure the backend privately

Keep your existing backend service URL. Root directory `backend`; Node 22 recommended (minimum 20.19).

| Setting | Value |
| --- | --- |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/health` |

Required environment variables are listed in `backend/.env.example`:

- `MONGO_URI`: your existing database connection.
- `TOKEN`, `PHONE_ID`: your own Cloud API token and phone-number ID.
- `JWT_SECRET`: retain a strong existing secret; now requires at least 32 characters. Rotation logs out old sessions.
- `VERIFY_TOKEN`: retain the value used for webhook verification.
- **`APP_SECRET`: mandatory Meta app secret, used to verify actual webhook signatures.** This is different from the access token and verify token.
- `FRONTEND_URL`: exact deployed frontend origin, no trailing slash. This must match CORS and Socket.IO origins. Multiple origins can be comma-separated.
- `WHATSAPP_API_VERSION`: supported Graph version enabled for your Meta app; supplied default `v25.0`.

Optional: `WABA_ID` for listing your approved templates; `DISPLAY_PHONE_NUMBER` for display; `FFMPEG_PATH` to override the included static FFmpeg binary.

Leave `ALLOW_FIRST_USER_SETUP=false` for an existing database. On a completely new database, enable it with a strong private `SETUP_KEY` just for first-account creation, then disable it and remove the key. There is no open public registration.

## 4. Configure the frontend

Keep your existing static-site URL. Root directory `frontend`.

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Publish directory | `build` |
| `REACT_APP_API` | Your backend **origin**, without `/api` or a trailing slash |
| `VITE_DEMO_MODE` | `false` for your real deployment |

`REACT_APP_API` remains compatible even though the UI now uses Vite. `VITE_API_URL` is also supported. Changing these values requires rebuilding. Keep SPA fallback `/*` → `/index.html`; the optional `render.yaml` has an example. Do not create duplicate Render services just to use that blueprint.

Never place `TOKEN`, `MONGO_URI`, `APP_SECRET`, `JWT_SECRET` or other backend secrets in a frontend variable. Vite frontend variables are public after build.

## 5. Meta and live smoke test — to do with your account

The existing webhook callback remains `https://YOUR-BACKEND-ORIGIN/webhook` and needs the `messages` subscription. Use your real backend URL in Meta's dashboard, not that illustrative address. Confirm the verify token and Meta app secret belong to the same configured app.

1. Confirm backend `/health` returns success; sign in using an existing account.
2. From a consenting test contact, message the configured Cloud API number. Confirm that incoming text appears and the reply window opens.
3. Reply, quote an incoming message, add/remove a reaction and confirm delivery/read callbacks from the real number.
4. Send a small photo/document and a short voice note. Check the recipient and authenticated playback/download. Voice recording requires a secure browser context and microphone permission.
5. Check a closed-window chat: free-form sends must be blocked. If needed, use a genuinely approved text-body template and consent. Sending a template alone must not reopen the window.
6. Open a second browser session to check realtime events. Archive/star/mute/delete-for-me stay app-local; shared contact names/notes remain visible to authorized users.
7. Refresh/reconnect once. Render Free can cold-start; the app is not guaranteed to run continuously.

Do not test against uninvolved recipients. Hosting is free-tier oriented, but Meta can charge for messaging/templates. No QR login, personal groups, Status or personal voice/video calls are provided.

## Rollback and storage cautions

Keep the previous source branch/commit and your private backup. Roll back **both** frontend and backend together if necessary. No database migration runs on startup and no legacy collections are deleted automatically. The new server creates its required indexes on startup; the existing message TTL is retained.

New attachments no longer use public `/uploads` URLs, so the old frontend is not a compatible viewer for all new metadata. Do not assume switching source commits restores erased runtime files or expired Meta media.

Atlas Free's 512 MB includes indexes as well as message/contact data. Delete-for-me only hides retained records; it does not immediately reclaim database space. Monitor Atlas storage, message TTL and unused legacy collections. This implementation does not promise a fixed message capacity or production uptime.
