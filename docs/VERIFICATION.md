# Local verification report — v2.2

Verified on **9 November 2026** for the delivered Incoming Safety + Template Sender source, including the existing personal-chat/Contacts features. Repository: `kawalekailas-code/wpsomsai`; local branch `incoming-template-sender`. The workspace HEAD remains original `a62146ac432abd03ee17de10d7f3feb013b89d37` with the delivered rebuild/updates in the working tree; this is a **complete source snapshot**, not a new Git commit or patch against the current remote.

**No GitHub push, Render deployment, production MongoDB operation or live WhatsApp send was performed.**

## Results

| Check | Result |
| --- | --- |
| Backend integration/migration/sender/recovery tests | **81 / 81 passed** |
| Frontend helper/unit tests | **34 / 34 passed** |
| Chromium desktop/mobile browser tests | **20 / 20 passed** |
| Total automated scenarios | **135 passed, 0 failed** |
| Production frontend build | Passed; main JS approximately 455 KB minified / 144 KB gzip, new screens/parsers lazy-loaded |
| Backend JavaScript syntax | Passed |
| `git diff --check` | Passed |
| Production dependency audit (`npm audit --omit=dev`) | Backend **0**, frontend **0** known vulnerabilities reported |
| Package/lockfile root metadata | Both agree at **2.2.0** |
| Migration CLI `--help` | Passed without credentials/database access |
| Clean extracted-source install | Backend `npm ci --omit=dev` + syntax/help, frontend `npm ci` + 34 units + production build passed |
| Source ZIP integrity | CRC and per-file SHA-256/source-byte comparison passed; private/runtime/build files excluded |
| Local visual checks | New sender/safety desktop and 390×844 mobile; no page errors, mobile width 390/no document overflow |

Runtime: Node **20.20.2**, npm **10.8.2**, Linux. Node >=20.19 is required; Node 22 is recommended for deployment. These checks are point-in-time local tests, **not an independent security audit** or real-host certification.

## 1,000-recipient mocked load/recovery check

A disposable local MongoDB and mocked send function were used. Each step advanced the persisted `nextSendAt` to avoid waiting the real configured quiet gap; production gap enforcement is tested separately. No provider network sends or real contact list was used.

Observed in the final backend run:

| Metric | Result |
| --- | --- |
| Unique mocked outgoing recipients | **1,000** |
| Maximum simultaneous send calls | **1** |
| Incoming signed HTTP webhooks processed while mock sends were in flight | **40** |
| Incoming/outgoing stored rows | **40 / 1,000** |
| Duplicate incoming replay | Still **40** incoming rows |
| Recipient states after attempts | **1,000 API-accepted**; not simulated proof of real delivery |
| Accelerated loop time | **30.656 seconds** |
| Local incoming webhook latency p95 / max | **22.5 / 23.1 ms** |
| Node process RSS at start/end | **106.1 / 105.4 MB** |

Those times/RSS are sandbox observations, **not a real sending-rate promise, Meta capacity/delivery test, Render load guarantee or production memory bound**. MongoDB runs in a separate test process; its memory is not included. Network, actual serial gap/tick, account limits, larger media, database indexes/load, free-host sleep and notifications were not benchmarked against the user's services.

## Backend coverage

Existing chat/Contacts/migration tests remain, plus 46 dedicated sender/incoming scenarios. Tests reset all loaded models and template/storage caches, block external network calls and use disposable MongoDB/mocked Graph API responses. Coverage includes:

- Auth/admin permissions, safe profiles, locked first-account setup, revoked/deleted users, removed marketing routes and non-public uploads.
- Indian/international contact normalization, add/edit/import/preview/search/pagination/deduplication, selected/filter exports, shared removal without message/window loss and spreadsheet formula safety.
- Native reply/reaction/location/contact payloads, idempotent client IDs, closed 24-hour window, per-user stars/hide/clear and stable message/around pagination.
- Raw-byte webhook signatures; journal before acknowledgement; write failures returning non-200; partial message/contact-write recovery; batch capture followed by bounded drains; duplicate IDs and expired processing claims.
- Unsupported/malformed/null events and invalid statuses held for review; BSUID-only retention without fabricated phone; acknowledgement does not delete payloads.
- Received-time visibility/unread after clear/hide, delayed provider timestamps, sync pagination with equal timestamps, private deletion tombstones and bounded read checkpoints.
- Approved-template cursor pagination/cache, exact language, unsupported components, named/body parameter compilation, no browser token exposure.
- Preview invalid/duplicate/opt-out/uncertain reporting, all-book pagination/caps, signed frozen recipient list, modification/user binding/expiry checks, consent/charges, template signature change and sender-disabled gates.
- Upload byte checking, template/language/owner binding, one shared image ID reused, template image history/gallery and valid free-form image forwarding with a destination window.
- Durable single-worker lease, minimum gap, explicit pause/resume, late suppression, per-chat template suppression, cancellation of persisted-unattempted messages, cancellation during preparation/persistence and an already in-flight request.
- Restart: safe never-attempted leases recover; attempted/in-flight rows become uncertain, never automatically reset for sending. Interrupted cancellation recovers. Disabled sender still maintains recovery and drains the incoming journal.
- Ambiguous timeout/HTTP 5xx/post-accept database failure with no automatic resend; manual review; ID-only/early opaque/out-of-order status reconciliation; missing opaque data stays uncertain rather than guessed.
- Backlog/attention/storage gates, unavailable/high stats and creator-session revocation; no network send before failed safety checks.
- A saved three-recipient queue completes using the **real Node worker with mocked Graph HTTP** after creation, with **no UI detail/heartbeat polling**. This is separate from the browser-local demonstration.
- Authenticated media proxy/temporary cleanup, **actual FFmpeg OGG/Opus conversion**, Socket.IO HTTP/room authentication and legacy-media repeat-safe dry-run/apply/failure tests (mocked upload).

This is targeted integration coverage, not exhaustive exploration of every possible MongoDB/OS/provider failure interleaving. The observed lease and delayed-catch-up regressions were fixed and covered before the final full pass.

## Frontend and browser coverage

34 unit scenarios cover existing chat helpers, Contacts CSV/VCF parsing, safe reports, sender totals, tombstone/clear/around merges, large sender CSV without expanding the Contacts import limit, and persisted fictional sender/safety state.

20 Chromium scenarios include the existing personal-chat and Contacts desktop/mobile flows, plus:

- Template/parameter selection, preview, consent/cost/final confirmation, one saved job, pause/resume/cancel/report and reload persistence.
- CSV invalid/duplicate/suppressed rows, no queueing before confirmation, opt-out/re-opt-in gate and Marathi media upload requirements.
- Private BSUID event inspection/export/retry/acknowledgement without deletion.
- Mobile menu availability and no document overflow.
- **Real-mode frontend with HTTP/socket endpoints mocked:** offline/reconnect catches up a stored incoming without a socket event, idempotent repeated catch-up, around-search no unseen injection/read, and clearing/deleting-for-me while an older catch-up is in flight does not resurrect hidden history or suppress other new incoming.

The interactive demo is explicitly fictional and does not call WhatsApp. Its simulated job progression advances when job details are read; it is **not** evidence of a real background worker or cryptographic server authorization. The dedicated backend worker test supplies that separate check. Small demo media is kept as browser-local data URLs; larger files are not permanent playable archives.

Screenshots were inspected locally. This is Chromium at representative desktop/mobile sizes, not a full Safari/Firefox/physical-device matrix. Production build success is not proof of real-host CORS/HTTPS/service-worker correctness.

## Not claimed / still account-dependent

- No actual user's Meta token/WABA permissions, template approvals, opaque callback echo/timing, account messaging/quality limits or WhatsApp phone delivery was verified.
- No actual 1,000-contact send, paid/free hosting change, fake keepalive, production storage fill/failure, live deployment or existing database migration was performed.
- No reconstruction of the old standalone sender's historical delivery IDs, recovery of previously lost files or permanently retained media.
- No absolute zero-loss/exactly-once/always-on claim; no native BSUID phone-chat/reply implementation, QR login, personal groups/Status/calls/presence, CRM, pipeline, marketing module or end-to-end encryption of this app's database.

Use the [controlled post-deployment checklist](DEPLOYMENT.md) with your own consenting test contact before enabling the queue. [Usage and recovery guide](INCOMING-SENDER-UPDATE.md).
