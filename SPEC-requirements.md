# Encrypto — Requirements

- **Category:** Utility
- **Complexity tier:** Medium
- **Status:** In Progress (build kickoff — Plan mode re-confirmed 31 Oct 2026)

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
*Naming convention: REQ-XX functional, NFR-XX non-functional.*
