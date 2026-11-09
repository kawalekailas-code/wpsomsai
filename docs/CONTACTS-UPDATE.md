# Contacts upload & management — v2.1

## Upload/deploy karaycha kasa?

He **updated full-source ZIP** aahe: `omsai-contacts-update.zip`.

1. ZIP extract kar ani tyatil `wpsomsai` folder open kar.
2. Tyachya aatle `backend`, `frontend`, `docs`, `README.md`, `package.json` ani itar source files existing repository chya **root** madhye upload/overwrite kar. Extra nested `wpsomsai` folder banvu nakos.
3. `backend/package.json` + `backend/package-lock.json` ani `frontend/package.json` + `frontend/package-lock.json` donhi pairs upload zalyachi khatri kar. Frontend la don nave parser/phone-validation dependencies aahet.
4. Existing `.gitignore` unchanged aahe. Hidden `.env.example`/`.gitkeep` file picker madhye disat nasel tari deployment thambat nahi. **Actual `.env`, tokens kiwa database backup upload karu nakos.**
5. Backend ani frontend **same updated commit** var deploy kar. Navin environment variables lagat nahit; previous Cloud API configuration, including `APP_SECRET`, preserve kar. Existing Render services update kar—duplicate services nako.
6. Ya contacts update sathi old source files manually delete karaychi garaj nahi. Database drop/reset/migration karu nakos. Existing users, messages, stars ani chat settings retain hotat.

The contacts feature is local in this delivery, on branch `contacts-management`. It has **not** been pushed to GitHub, deployed to Render, or tested against your private database. Earlier personal-chat source was uploaded by you; this is a new update to it.

An optional `omsai-contacts-update.patch` is based on the uploaded personal-chat commit `1f20f6544e27c893e8fb4b5b35a2a145b8f4abb2`. Apply only to a clean matching checkout after `git apply --check`; do not force it over other changes.

## What you can do

Open **Contacts** from the main rail, or on mobile use **Chat list menu → Manage contacts**. Contact info also has a Manage contacts button.

- **Add contact:** enter one name, phone and workspace note, then Save contact. No message or empty conversation is created.
- **New chat:** the existing New chat action remains. If the number is already saved, it opens that chat without overwriting the saved name/notes or creating a duplicate.
- **Edit:** change a name or note. Phone numbers are immutable chat identities. Add a new contact for a different number rather than silently moving history.
- **Search:** name, phone or note; alphabetical pages of 50. The address book includes saved contacts even when their chats are archived/hidden.
- **Open chat:** explicitly opens a saved number in the conversation list; it does not send a message or open the reply window.
- **Import:** choose CSV or VCF, preview, review invalid/duplicate rows, then explicitly confirm Import.
- **Export:** all matching/search-filtered contacts or up to 100 selected contacts as UTF-8 CSV.
- **Remove:** one or up to 100 selected contacts, with a confirmation explaining the shared effect. Names/notes are cleared and numbers are removed from the shared saved-contact list. Existing messages and reply-window metadata are kept.
- **Save an unknown sender:** incoming numbers appear in chats but are not automatically saved to Contacts. Use Contact info → Save to contacts, or add/import the same number. No duplicate number is created.

## Supported contact files

**Limits:** 512 KB per file, 500 phone entries per import. A vCard with two numbers produces two phone entries. Split bigger files. Preview/import requests are rate-limited per account and independently validated by the backend.

CSV must use UTF-8. Download the CSV/VCF samples from the import screen; the files also live in `frontend/public/samples/`. Supported CSV headers include:

```csv
Name,Phone,Notes
Neha Example,+919000000101,Friend from Pune
Arjun Example,+919000000102,College friend
```

- Name and Notes are optional; Phone is required as a recognized column. A phone-only CSV is supported.
- Header aliases include Mobile, Phone number, WhatsApp, First Name/Last Name and Google Contacts `Phone 1 - Value`, `Phone 2 - Value`, etc. Unknown columns are ignored, not stored.
- Comma, semicolon and tab delimiters, UTF-8 BOM, quoted commas, escaped quotes and multiline notes are supported.
- `.xlsx` is not imported directly. Export it first as **CSV UTF-8**. Keep phone cells as **Text** so Excel does not turn them into scientific notation or lose digits.
- CSV exports prefix potentially formula-like cells with an apostrophe, including +phone numbers. This prevents spreadsheet formula execution; the importer recognizes that protective apostrophe.
- Common UTF-8 vCard 2.1/3.0/4.0 exports are supported: FN/N names, multiple TEL entries, NOTE, folded lines, tel URIs and common quoted-printable text. Photos and other binary/address/URL fields are ignored. This is not a promise to accept every vendor-specific vCard dialect.
- Numbers with an explicit country code are recommended. Ten-digit numbers default to India (+91); `00` international prefixes normalize to `+`. Impossible numbers, scientific notation and extensions are flagged rather than guessed. Validation does not prove the number is registered on WhatsApp.
- Names: maximum 100 characters. Notes: maximum 2000. Oversized/invalid records are not silently truncated and saved.

## Preview and duplicates

The first valid occurrence of a number within a file wins. Later occurrences are reported as file duplicates. If the first occurrence has an invalid name/notes/number, a later valid occurrence can still be used.

Default policy: **Skip existing contacts**. Optional policy: **Update non-empty names and notes**. Blank imported fields do not erase existing details. An unsaved number already known from a chat is saved again, preserving its existing history and reply-window timestamp.

Preview does not write contacts. The final import **revalidates against current database state**; it does not trust action labels supplied by the browser. If another account changes contacts after preview, final counts may differ. Unique normalized phone numbers and atomic upserts prevent duplicates under concurrent imports.

Review New / Save again / Update / Already saved / Duplicates / Invalid counts. You can filter invalid rows and download a complete CSV row report. The on-screen table shows at most 100 matching rows; the report covers all rows. Partial failures are reported, not silently called successful. For an uncertain network result, refresh and preview again with skip-duplicates before retrying.

## Privacy, storage and messaging boundaries

- The address book, names and notes are **shared with all authorized workspace users**. They are not per-user private. The remove confirmation makes this explicit.
- Contact removal is not the same as app-local Remove chat. It does not delete message history, block a number, change anyone's personal phone contacts or reclaim all technical-record storage. A minimal number record remains to preserve chat/API identity and reply-window metadata.
- Existing records without the new `isSaved` / `chatStarted` fields remain visible as before. Newly imported/single-added address-book entries do not flood the chat list with empty chats.
- Contacts do not have the 30-day message TTL. Monitor Atlas storage: 512 MB includes all data and indexes. No fixed address-book capacity is promised.
- Files are parsed in the browser. Only supported name/phone/note fields are sent to the authenticated backend; raw uploaded contact files and photos are not stored on Render or in MongoDB. Personal fields are excluded from service-worker caching.
- **Imports do not send WhatsApp messages.** They do not verify WhatsApp registration, provide consent, enable marketing, reopen the 24-hour reply window, import personal chat history or bypass the official Cloud API.

## Verification

Current suite: **35 backend + 26 frontend unit + 11 desktop/mobile browser tests**. Production build passes. Both production dependency audits reported zero known vulnerabilities at verification time. Backend tests use disposable MongoDB/mocked Meta; browser tests use the visibly fictional demo. No live account delivery or live contact migration was performed.
