# Encrypto — Requirements

- **Category:** Utility
- **Complexity tier:** Medium
- **Status:** Built (Encrypto v1.0.0) — shipped & signed off 31 Oct 2026 (v1.1 reqs in §8-9)

> Build-standards flags agreed at kickoff (31 Oct 2026): **Stack** vanilla HTML/CSS/JS,
> no build; **Rigour** Medium-high; **Platform** installable mobile-first PWA, zero network;
> **License** MIT; **Copyright holder** Isaac A Gera; **Auto-lock** 5 min idle default;
> **Clipboard auto-clear** 30 s. Because Encrypto holds real sensitive data, the crypto model
> below is a set of requirements, not suggestions.

## 1. Product Overview
A private, locally-encrypted personal/family wallet for holding sensitive reference info in
one place: key document details (passport, licence, policy numbers), passwords/logins, and
card details. Everything is **encrypted at rest** in the browser and unlocked with a single
**master passphrase**. No accounts, no servers, **zero network** — nothing ever leaves the
device. Encrypted export/import provides a safe backup path.

## 2. Scope (v1) — agreed
- Master-passphrase set-up and unlock.
- Add / edit / delete entries across four types: **Document, Password, Card, Note**.
- Client-side encryption via the **Web Crypto API** — nothing stored in plaintext.
- Search / filter across entries (over decrypted-in-memory data while unlocked).
- Copy-to-clipboard with **auto-clear**.
- **Auto-lock** on idle and on tab close/refresh.
- **Encrypted export/import** backup.
- Local-first, offline, installable **PWA**.
- Explicit stance: **lose the passphrase and the data is unrecoverable by design.**

## 3. User Stories

### Unlock & security
- REQ-01: As a user, I want to set a master passphrase on first use, and unlock with it
  each session, so only I can read the vault.
- REQ-02: As a user, I want the vault encrypted at rest so that raw browser storage reveals
  nothing useful without my passphrase.
- REQ-03: As a user, I want the app to auto-lock after a period of inactivity and when the
  tab closes/refreshes, so an unattended device doesn't expose data.
- REQ-04: As a user, I want a wrong passphrase to simply fail to unlock (no partial access),
  and tampered storage to be detected.

### Entries
- REQ-05: As a user, I want to add/edit/delete entries of type Document, Password, Card, or
  Note, each with sensible fields for that type.
- REQ-06: As a user, I want sensitive fields (passwords, card numbers, CVV) masked by
  default and revealable on demand.
- REQ-07: As a user, I want to copy a value to the clipboard and have it auto-clear after a
  short delay, so it doesn't linger.
- REQ-08: As a user, I want to search/filter my entries so I can find things quickly.

### Backup
- REQ-09: As a user, I want to export an **encrypted** backup file and import it back, so I
  can safely keep a copy or move to another device (the backup is useless without my
  passphrase).

## 4. Non-Functional Requirements
- NFR-01: **Rigour** — Medium-high (highest in the app family). Careful, standards-backed
  crypto; input validation; no plaintext ever persisted; **never log secrets**; tested
  encrypt/decrypt round-trips.
- NFR-02: **Stack** — vanilla HTML/CSS/JS, no build step. **Web Crypto API is native**, so
  no crypto library and no bundler needed.
- NFR-03: **Platform** — installable, mobile-first **PWA**, fully offline. **Zero network
  calls** at any point (stronger privacy than any other app in the family).
- NFR-04: **Data/privacy** — 100% local; `localStorage` only; nothing leaves the device;
  no accounts, no telemetry.
- NFR-05: **Recoverability stance** — no passphrase recovery, no backdoor, no reset. This is
  intentional and must be made **unmistakable in the UI at set-up** ("there is no recovery;
  store your passphrase safely").
- NFR-06: **Data safety** — encrypted export/import is the primary backup; validate on
  import; keep the on-disk/format version tagged so future format changes can migrate.

## 5. Out of scope (v1) — possible v2+
- Argon2 key derivation (stronger vs GPU attacks; needs a WASM lib — a v2 hardening option).
- Per-entry encryption (v1 encrypts the whole entries blob as one unit).
- Password generator, breach checks, attachments/files, categories/folders, biometric unlock.
- Any sync or cloud backup (would break the zero-network stance — deliberate non-goal).

## 6. Honest limitations (to state plainly in the app/user guide)
- `localStorage` is **device/browser-scoped**: clearing browser data wipes the vault — hence
  export/import is prominent, not buried.
- Browser-based crypto is only as safe as the device/browser it runs on; this is **not a
  hardware vault** and not a certified security product. Suitable for personal/family
  document and card *details*; we will not oversell it.

## 7. Build kickoff decisions (resolved 31 Oct 2026)
- **Licensing:** MIT. ✓
- **Copyright holder:** Isaac A Gera (footer + LICENSE). ✓
- **Crypto model:** re-confirmed in Plan mode — PBKDF2-SHA256 ~310k + AES-GCM-256 (see design). ✓
- **Auto-lock idle default:** 5 minutes. ✓
- **Clipboard auto-clear delay:** 30 seconds. ✓
- Argon2id recorded as a **v2** key-derivation upgrade candidate (see §5 / design §8).

---

# v1.1 — Deferred features (captured 31 Oct 2026; NOT yet built)

> Captured from v1.0.0 sign-off discussion so the scope isn't lost. These are the next
> set of tasks for Encrypto. **Not started** — v1.0.0 ships first and must be verified on a
> real iPhone. The attachments piece changes the storage architecture, so it needs its own
> **Plan/Quick-Spec** pass before any code (same discipline as the v1 crypto core). Status of
> the app stays `In Progress` for v1.0.0 until Isaac signs off; v1.1 begins as a fresh build.

## 8. Feature: Encrypted attachments (the larger piece)
Let users attach files (document scans, photos, PDFs) to an entry while adding/editing it.

- **REQ-10:** As a user, I want to attach one or more files to an entry (at least Document and
  Card; Password/Note too for consistency), so a scan/photo lives alongside its details.
- **REQ-11:** As a user, I want each attachment **encrypted at rest** with the same vault key,
  so files are ciphertext like everything else — nothing stored in the clear.
- **REQ-12:** As a user, I want to see an entry's attachments (name + size), **view/download a
  decrypted copy on demand**, and **remove** an attachment.
- **REQ-13:** As a user, I want attachments included in the **encrypted export** and restored on
  import, so a backup stays complete.
- **REQ-14:** As a user, I want a sensible **per-file size cap** with a clear warning above it,
  so I don't exhaust storage or create unusable backups.

### Non-functional / design constraints (attachments)
- **NFR-07 (storage engine):** move binary attachments to **IndexedDB** (not localStorage —
  its ~5 MB whole-origin budget is unsuitable and risks corrupting the vault blob). Store only
  `{ id, entryId, iv, ciphertext, name, mimeType, size }`; encrypt filename + MIME too (they can
  be revealing). Entries blob stays in localStorage as today.
- **NFR-08 (crypto reuse):** reuse the existing AES-GCM key + fresh-IV-per-item model from
  `crypto.js`; no new crypto primitives. Key stays in memory only; attachments unreadable when
  locked. Add a test harness (encrypt→decrypt bytes round-trip, wrong-key, tamper).
- **NFR-09 (size/format):** propose **~5 MB per file** cap (confirm at kickoff). Export remains
  JSON-with-base64 for v1.1 (bigger files = bigger backups — acceptable; a binary export format
  is a later option).
- **NFR-10 (iOS-PWA handoff):** viewing/saving a decrypted file leans on OS-handoff APIs that
  differ in a standalone iOS PWA — apply the generate-in-app + adaptive-delivery pattern (share
  sheet on mobile, download on desktop) with a fallback; definitive check is a real installed
  iPhone (per the `ios-pwa-patterns` rule).
- **NFR-11 (versioning):** ships as **v1.1.0** — bump `APP_VERSION` + `CACHE_NAME`, changelog
  entry, and migrate the on-disk schema version so existing v1.0.0 vaults keep opening.

### Kickoff decisions (resolved — v1.1 Plan mode)
- **Per-file cap:** 5 MB. ✓
- **Over-limit handling (REQ-18):** when a chosen file exceeds 5 MB, show a choice. For
  **images**, offer either *downscale-and-recompress in-browser* (canvas → JPEG/WebP at reduced
  dimensions/quality until under the cap) **or** pick a smaller file. For **non-images**
  (PDF/docx/etc.), only *pick a smaller file* is offered — the browser can't meaningfully
  compress those without a heavy dependency (would break the no-build stance), so we don't
  pretend it can.
- **Entry types:** attachments on **all four** (Document, Password, Card, Note). ✓
- **Image preview (REQ-19):** **in scope for v1.1** — inline thumbnail for image attachments
  (decrypt → object URL → render → revoke); non-images show an icon + name/size. Shares the
  image-decode path with the compression feature.
- Soft warning if total encrypted export grows large (≈25 MB) — advisory only.

## 9. Feature: Folders within categories (the smaller piece)
Optional grouping inside each entry type, for users with many entries.

- **REQ-15:** As a user, I want to create named **folders** and assign entries to one, so I can
  organise within a type (e.g. "Family" vs "Work" documents).
- **REQ-16:** As a user, I want the vault list to **group by folder** (with an "Unfiled" group),
  and to filter/collapse by folder.
- **REQ-17:** As a user, I want to **rename/delete** a folder; deleting a folder must not delete
  its entries (they fall back to Unfiled).

### Non-functional / design constraints (folders)
- **NFR-12:** data-model + UI change only — add an optional `folder` field to the entry schema;
  **no new storage engine** needed. Lower risk than attachments; could ship in the same v1.1 or
  as a small standalone step.
- **NFR-13:** backward-compatible — existing entries with no `folder` render as "Unfiled"; no
  migration pain.

---

# v1.2 — Biometric unlock (Face ID / fingerprint) — captured, NOT yet built

> Raised during v1.1 testing (31 Oct 2026). Agreed to **defer to v1.2** and keep v1.1 focused on
> attachments. Needs its own **Plan-mode** pass before any code, because it changes the
> "nothing but ciphertext is persisted" stance (see the tradeoff below). This is **device-local
> convenience, not cross-device sync** — syncing would break the zero-network stance and is a
> non-goal.

## 10. Feature: Biometric unlock via WebAuthn (per device)
Let a user unlock on a supported device with Face ID / Touch ID / platform fingerprint instead of
typing the passphrase, on that device only.

- **REQ-20:** As a user on a supported device, I want to enable biometric unlock so I can open
  the vault with Face ID/fingerprint instead of typing my passphrase each time on this device.
- **REQ-21:** As a user, I want to enrol biometric unlock explicitly (opt-in) and be able to
  disable/forget it per device.
- **REQ-22:** As a user, I want the **master passphrase to remain the source of truth** — always
  usable, required for setup/recovery, and the only way in on devices/browsers without (or not
  enrolled in) biometrics.

### Non-functional / design constraints (biometric) — RESOLVE IN PLAN MODE
- **NFR-14 (the key tradeoff — must be a conscious decision):** biometrics *authenticate*, they
  do not *derive the key*. To unlock without the passphrase, the vault key (or passphrase) must
  be **stored on the device**, wrapped/gated behind a WebAuthn platform credential that requires
  the biometric. This is a deliberate change from today's stance where the key is derived fresh
  and **never persisted** — convenience in exchange for an at-rest key on the device. Record the
  decision explicitly before building.
- **NFR-15 (mechanism):** WebAuthn platform authenticator (passkey-style) to gate release of the
  wrapped key; wrap with a key held in the credential / WebCrypto, never in plaintext storage.
- **NFR-16 (scope):** strictly per-device, local; no network, no cross-device sync. Each device
  enrols separately.
- **NFR-17 (iOS-PWA reality):** platform-authenticator behaviour inside an *installed* iOS PWA is
  OS-handoff-sensitive and only verifiable on a real installed iPhone (per `ios-pwa-patterns`).
- **NFR-18 (fallback):** always fall back to passphrase unlock if biometrics are unavailable,
  not enrolled, or fail. Biometric is a convenience layer on top, never a replacement.

---

# Future consideration — unlock throttling (ONLY if Encrypto becomes a store app)

> Raised 31 Oct 2026. Decision: **do nothing for the web/PWA version.** Captured for
> reconsideration **only if** Encrypto is ever developed into a packaged Play Store / App Store
> app, where the threat model and storage sandboxing differ.

## 11. Feature (deferred/conditional): gentle unlock throttle
- **REQ-23 (conditional):** As a user, after several wrong passphrase attempts I want an
  increasing delay before the next attempt, to deter casual guessing on an unlocked device.

### Rationale & constraints (why it's deferred, not dismissed)
- **Why not now:** in the web/PWA model the real brute-force path is **offline** against the
  ciphertext in `localStorage`/an export file — an attacker bypasses the UI entirely, so a UI
  lockout is largely theatre. The actual defence is already in place: **PBKDF2 ~310k iterations
  + a strong passphrase** make each guess expensive at the crypto level.
- **Non-destructive only:** any throttle must be a **delay**, never a data-wipe-after-N-attempts.
  With Encrypto's no-recovery model a destructive lockout risks permanent accidental data loss
  (e.g. a child mashing keys) — a worse outcome than the threat. Destructive lockout is
  explicitly rejected.
- **When it becomes worthwhile:** a packaged store app (sandboxed app-private storage, store
  security expectations, possibly OS keystore-backed keys) changes the threat model and makes a
  throttle more meaningful — revisit it as part of that larger "store app" track, alongside
  biometric unlock (§10) and any revised crypto/key storage.

---
*Naming convention: REQ-XX functional, NFR-XX non-functional.*
