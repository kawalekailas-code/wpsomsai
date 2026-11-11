# Incoming Safety + Template Sender — v2.2

## Thodkyat: ha ZIP kasa vapraycha?

`omsai-incoming-sender-v2.2-source.zip` ha **complete updated source** aahe; old Contacts-only ZIP/patch nahi.

1. ZIP extract kar. Aatla `wpsomsai` folder open kar; **tyachya aatle files existing GitHub repository chya root madhye** update kar. Extra `wpsomsai/wpsomsai` folder banvu nakos.
2. Backend ani frontend **donhi** update kar; donhi `package.json` + `package-lock.json` pairs upload kar. Existing users/history aslela MongoDB URL badlu/reset/drop karu nakos. Adhi private backup ghe.
3. Render backend var existing secrets preserve kar. Navin queue sathi `WABA_ID` set kar; `SENDER_ENABLED=false`, `STORAGE_LIMIT_MB=512` thev. Exact settings khalil table madhye aahet. **Frontend madhye Meta/Mongo/JWT secrets nako.**
4. Existing `/webhook` callback, phone number ani `messages` subscription thev. Old `htmlwp` sender ani navin queue ekach veli chalvu nakos—shared account limits/duplicate sends ani app-baherche opt-out bypass hou shaktat.
5. Existing Render backend/frontend services var same updated source deploy karaycha; duplicate services banvaychi garaj nahi. [Full deployment and rollback checklist](DEPLOYMENT.md).
6. Deploy nantar admin account madhye **Incoming Safety** open kar. Eka consenting test contact kadun incoming path, reconnect catch-up ani live status receipts verify kar. He checks pass zalyavarach backend `SENDER_ENABLED=true` kar ani agodar **fakt 1 consenting recipient** var queue verify kar. 1,000 contacts var live test karu nakos.

**Ya delivery madhye real WhatsApp send, GitHub push, Render deploy kiwa production database changes kele nahit.** Tests disposable MongoDB + mocks var aahet.

## What changed

### Incoming capture, persistence, catch-up and notification are separate

1. **Receipt:** Meta must actually deliver a signed webhook to the existing backend. The app cannot recover a webhook Meta never sends to it, an unsubscribed number, or an outage beyond provider retry limits.
2. **Durable capture:** after original-byte HMAC verification, all recognized-number events in the request are upserted into `InboundEvent` **before HTTP 200**. The first eight are processed synchronously; the rest are durable pending work. There is no in-memory-only acknowledgement queue. Journal/message write failure returns non-200 when processing that request; provider retries and the worker are complementary safeguards, not guarantees.
3. **Database recovery:** unique WhatsApp IDs prevent duplicate chat records. Pending/failed processing retries with backoff; expired processing claims can recover after a restart. No incoming-media download/transcode occurs before acknowledgement. Unknown/unsupported/malformed and BSUID-only data is retained for private admin review. Events explicitly belonging to another phone-number ID are ignored by this single-number workspace.
4. **UI catch-up:** Socket.IO still gives realtime hints. Reconnect, online, foreground and **Sync stored messages** use an authenticated per-chat update cursor to fetch stored changes in pages of 100. A run is bounded to 50 pages; a visible prompt offers continuation if more remain. Reopening a chat loads latest history. Other chats refresh in the conversation list; opening one fetches its stored history.
5. **Reading/notifications:** new incoming `receivedAt` is server receipt/persistence-attempt time; `createdAt` preserves provider event time. Delayed incoming can reappear after a clear/hide boundary without reopening an expired 24-hour window. Read checkpoints are bounded to loaded/caught-up data; around-search windows and scrolled-up/background views do not automatically mark newly unseen incoming read. Manual **Mark as read** remains an explicit user action. Browser notifications are opt-in hints and are not delivery receipts or a permanent message archive; closing the browser can stop them.

There is **no absolute zero-loss guarantee**. A full or unavailable MongoDB can reject the journal write; Render Free can sleep or restart; credentials, permissions, subscriptions and upstream outages still matter. The implementation reduces silent processing/UI gaps, but it cannot prove completeness against Meta's inbox.

### Incoming Safety (admins only)

Desktop: rail/sidebar **Incoming Safety**. Mobile: **Chat list menu → Incoming Safety**.

- Storage budget from cached `dbStats` logical data + indexes for this database, measured at most once per 60 seconds. **Atlas cluster usage is authoritative**; other databases and provider accounting are not included.
- Pending/processing/failed counts, attention events, last uniquely captured webhook and last stored incoming receipt time. Recent activity is not proof of complete subscriptions/delivery.
- List without raw payloads; open a private event to inspect/export its captured original payload fragment, retry processing, or acknowledge an attention event.
- **Retry** never sends outgoing messages. **Reviewed** clears the unreviewed warning but does not delete the payload, free its storage, fabricate a phone number or create a working reply path.
- Hidden-number/BSUID-only events are **not yet native phone chats**. Never derive or guess a phone from a BSUID. Keep/export the event privately and review the actual account/API support.
- Polling occurs only while the screen is visible (30 seconds), not an always-on browser monitor.

### Template Sender (admins only)

Desktop: **Template Sender**. Mobile: **Chat list menu → Template Sender**.

1. Fetch your **currently APPROVED** catalog from `WABA_ID`; choose exact name/language.
2. Fill the required body parameters. The same values go to every recipient; CSV contact names are **not** automatically substituted.
3. If needed upload one matching **JPEG/PNG ≤5 MB** or **MP4 ≤16 MB**. Byte/container type is checked; MP4 must already have WhatsApp-compatible codecs. There is no video conversion. One Meta media ID is reused throughout the job; no MongoDB binary archive.
4. Choose all matching saved contacts across all pages, explicit selected contacts, or a UTF-8 CSV with a Phone column (512 KB, up to the configured maximum). Preview shows ready/invalid/duplicate/suppressed/uncertain rows; download the full formula-safe report. Sender CSV does not import/save contacts or send messages by previewing.
5. Verify actual **recipient opt-in** and opt-outs, understand potential Meta charges, then review the template/eligible count and **Confirm and queue**. Saving a contact or approving a template is not proof of opt-in.
6. A user-bound signed preview freezes the ordered eligible phone list for 15 minutes. Adding an address-book entry after preview cannot enlarge this confirmed job. Eligibility is checked again; newly suppressed or uncertain recipients can reduce its final count. The selected template signature must still match. Changed content requires a fresh review.
7. Check **Saved jobs** for actual durable recipient states, errors, API IDs, reports and controls. One active/paused job at a time; no parallel fan-out, campaign schedules or CRM pipeline.

Supported here: static body/text-header/footer, up to ten text body parameters (positional or named), image/video header and static URL/phone/quick-reply buttons. Dynamic header/button parameters, authentication/Flow/carousel/product/document-header and other unsupported component formats are rejected/disabled rather than guessed. The older per-chat dialog remains a simpler text-body action, not the full media sender.

## Queue states and recovery

| State/action | Meaning |
| --- | --- |
| Pending / leased | Never network-attempted. A safely expired lease with zero attempts can return to pending. |
| Sending | An attempt has started. A restart/timeout is not proof it failed before delivery. |
| API accepted | Meta returned a WhatsApp message ID; **not** proof of delivery. Delivered/read are later webhook facts. |
| Failed | A definite API rejection or local pre-send cancellation, with the recorded reason. It is not automatically retried. |
| Uncertain | Response/DB-write/crash boundary cannot prove delivery. Retained for review, excluded from automatic retries and later job previews for that phone. |
| Reviewed | Admin checked an uncertain recipient; no resend occurs. A deliberate future job is possible only after that review. |
| Completed | No recipient remains awaiting a send attempt. Some can still be accepted/not delivered or failed. Export the actual report, not just the heading. |
| Pause/resume | Pause prevents further pending attempts. Explicit resume rechecks incoming/storage/template/access gates and resumes only never-attempted rows. An in-flight request can still finish. |
| Cancel | Prevents unsent rows, settles persisted-but-unattempted history, and survives interrupted cancellation/preparation. **Cannot unsend** an already in-flight/accepted request. |

The server persists the job, recipients and a unique outgoing message record before attempting the network send. A global database lease keeps one queue request in flight. The queue continues without UI polling while the backend is awake; browser closure does not cancel it. **Render sleep/restarts stop execution**, but saved pending progress remains in MongoDB. Safe recovery does not automatically resend an attempted/uncertain row.

Statuses bind by actual `wamid`; a per-recipient `biz_opaque_callback_data` adds correlation when a status arrives before a response or the response is lost. Meta documents this field for message/status tracking [3](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/). It is not an idempotency/exactly-once key. Account-specific live echo/timing remains unverified; without a usable ID/callback an ambiguous row stays uncertain for manual review.

Text/media template attempts appear in normal outgoing chat history. Media templates have image/video metadata for viewing, gallery and forwarding. A forwarded copy is a new free-form message and still needs the destination's open 24-hour window; a body over the 1,024-character media-caption forwarding limit is rejected rather than silently truncated. A template send itself does **not** create an incoming reply window.

## Opt-outs and the old tool

Use **Do-not-send** for opt-outs. Shared suppression is checked during preview and again before a queued recipient, and the app's per-chat template action also honors it. Removing suppression requires renewed opt-in confirmation. This does not block incoming messages or remove chat history; it is not automatic keyword-based opt-out detection and does not stop another external tool using your token.

Both tools use the same number and share Meta account limits/quality. Stop the old browser sender when using this queue to avoid overlapping sends. **Do not change the existing main webhook to the old tool.** Historical sends from the old tool are not imported/reconstructed, and its token-in-browser/unauthenticated implementation was not copied into the new backend.

## Backend configuration (private Render environment)

Keep all existing required variables, including `APP_SECRET`, and existing URLs. Add/review:

| Variable | Default / purpose |
| --- | --- |
| `WABA_ID` | Your WhatsApp **Business Account ID**, not PHONE_ID or display number. Required for the approved catalog; use your own number/WABA permissions. |
| `SENDER_ENABLED` | `false`. Enables only the new durable outgoing queue when explicitly set to `true`; inbound capture/recovery always runs. Existing manual per-chat sends are separate. |
| `SENDER_MAX_RECIPIENTS` | `5000`, hard maximum 5000 per job. Smaller limits can be configured. Contacts import separately remains 500 phone entries/file. |
| `SENDER_GAP_MS` | `1000`, minimum 300 / maximum 60000. Gap after each finished attempt. Worker tick (1500 ms), network/DB time, backlog and free-host sleep add overhead; no 1,000-recipient time/delivery promise. |
| `STORAGE_LIMIT_MB` | `512` logical data + indexes budget for this database. Use the actual quota; not a storage expansion setting. |

Outgoing creation/sending/resume is held when stats cannot be read, usage reaches **90%**, incoming has a failed/old backlog or an unreviewed attention event, the selected template changes/becomes unavailable, media approaches expiry, or creator access/session is revoked. The worker drains up to 20 incoming events first each tick and skips sending when that slice is full. Recovery also runs with sending disabled (sender maintenance throttled to about 15 seconds); attempted leases are not treated as safe to resend.

Incoming is **not deliberately blocked** to keep room for outgoing. A full database may still reject incoming writes; address storage warnings early. There is no destructive collection cleanup, automatic deletion of unresolved payloads, paid hosting requirement, external cron, keepalive trick or second webhook.

## Storage and retention

| Data | Retention |
| --- | --- |
| Chat messages, including stars | Existing 30-day TTL by provider/creation time, unchanged. |
| Successfully processed journal fragments | 24 hours after processing. |
| Pending/failed/attention journal fragments | No automatic expiry; acknowledgement does not delete them. |
| Completed/cancelled job + recipient reports with no uncertainty | Approximately seven days; later status reconciliation can refresh this metadata expiry. Export needed reports privately. |
| Active/paused/incomplete jobs, uncertain recipients | Retained for recovery/review, not silently expired. |
| Uploaded-media technical metadata | 29 days; Meta attachment availability is temporary, not a backup. |
| Saved contacts and opt-out suppression | Not subject to the message TTL. |

MongoDB TTL deletion is asynchronous. Attachments are uploaded to Meta and temporary Render files deleted; incoming media is not automatically archived. Admin event/report exports can contain private messages/numbers—do not put them into Git or public storage. Unresolved records still consume the finite 512 MB budget. Keep private backups and review warnings; acknowledgement alone does not reclaim space.

## Verified locally; not a live account test

**99 backend + 41 frontend unit + 28 desktop/mobile Chromium tests passed (168 total)**. The v2.3 dashboard added 18 backend, 7 frontend and 8 browser scenarios; sender results above are unchanged., production build passed, and both production dependency audits reported zero known vulnerabilities at verification time.

The 1,000-recipient test used **mocked sends with an accelerated persisted schedule**, not real recipients or a live throughput benchmark. Forty incoming webhooks were processed while mocked send requests were in flight, and a duplicate replay did not add a duplicate message. Restart/lease/DB failure, no automatic uncertain resend, cancellation races, early/out-of-order receipts and no-browser worker continuation were checked separately. See [full verification and honest limits](VERIFICATION.md).

## v2.3 dashboard note

This sender guide remains unchanged for the approved queue. v2.3 additionally adds a read-only admin System Usage Dashboard; it does not send messages or change webhook behavior. Current production load is unknown until you deploy the dashboard backend and open it as an admin.
