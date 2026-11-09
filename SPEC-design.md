# Encrypto — Design

- **Category:** Utility | **Tier:** Medium | **Status:** Built (Encrypto v1.1.6) — v1.0.0 core + v1.1 attachments + mobile polish, all shipped 31 Oct 2026

> This captures the design the build works against. Encrypto is the most security-sensitive app
> in the family, so these are decisions, not sketches. Core model re-confirmed in Plan mode at
> kickoff (auto-lock 5 min, clipboard clear 30 s, MIT, © Isaac A Gera). Sections 1–7 are the
> v1.0.0 core; **§9 covers v1.1 attachments**; §10 the update prompt; §11 the mobile layout.

## 1. Approach
A single-page, local-first PWA in vanilla HTML/CSS/JS. All cryptography uses the **native
Web Crypto API** (`crypto.subtle`) — no third-party crypto library, no build step, consistent
with the no-build stance. **Zero network**: the app never makes an outbound call.

## 2. Crypto model (the core — agreed)

### 2.1 Key derivation (passphrase → key)
- **PBKDF2** via `crypto.subtle.deriveKey`, hash **SHA-256**.
- **Random per-vault salt**, 16 bytes, generated once at set-up and stored (salt is not secret).
- **Iteration count ≈ 310,000** (aligned with current OWASP guidance for PBKDF2-SHA256).
  Store the count so it can be raised in future without breaking existing vaults.
- **Why PBKDF2, not Argon2:** PBKDF2 is native to Web Crypto — no WASM library, no build step.
  Argon2 is stronger against GPU attacks but needs an external lib; noted as a **v2 hardening
  option**, not v1.

### 2.2 Encryption
- **AES-GCM, 256-bit** (authenticated encryption — gives confidentiality **and** tamper
  detection via the auth tag).
- **Fresh random IV (12 bytes) per encryption operation**, stored alongside the ciphertext.
  Never reuse an IV with the same key.

### 2.3 Key handling
- The derived key is a **non-extractable `CryptoKey`**, held **in memory only** while unlocked.
- The **passphrase is never stored**; the **derived key is never persisted**.
- On lock (idle/close), the in-memory key is dropped and the UI returns to the unlock screen.

### 2.4 What is persisted (all non-secret) in localStorage
- `version`, `salt`, `iterations`, the `iv`(s), and the `ciphertext` blob.
- **No plaintext, no passphrase, no derived key** — ever.

### 2.5 Unlock verification
- No separate password hash. To unlock, **attempt to decrypt** the vault with the key derived
  from the entered passphrase. AES-GCM's auth tag means:
  - wrong passphrase → decrypt fails cleanly → "incorrect passphrase",
  - tampered/corrupt storage → decrypt fails → surfaced as an integrity error.

### 2.6 Unrecoverable by design
- No passphrase = no key = no data, permanently. No reset, no backdoor, no recovery.
- The set-up flow must make this **unmistakable** ("write your passphrase down somewhere
  safe — there is no recovery").

## 3. Data model
One vault object, encrypted as a single blob in v1:
```
{
  version,
  entries: [
    { id, type, title, fields{ ... }, tags, createdAt, updatedAt }
  ]
}
```
- **type ∈ { Document, Password, Card, Note }**, each with sensible fields, e.g.:
  - Document → docType, number, expiry, notes
  - Password → username, password, url, notes
  - Card → cardholder, number, expiry, cvv, notes
  - Note → body
- The **whole `entries` array is encrypted as one blob** (simplest, safe). Per-entry
  encryption is a later refinement.
- **On-disk schema version is 2** (as of v1.1). A v1.0.0 vault (schema 1) opens unchanged and
  is transparently re-stamped to schema 2 on first unlock — entries are untouched, no data loss.
  File attachments (v1.1) live in a **separate IndexedDB store**, not in this localStorage blob
  — see §9.

## 4. Security behaviours
- **Auto-lock:** on idle (configurable, default ~5 min) and on tab close/refresh — key wiped,
  return to unlock screen.
- **Clipboard auto-clear:** copying a password/card number clears the clipboard after
  ~20–30s.
- **Masked fields** by default; reveal on tap/hold.
- **Encrypted export/import:** the backup file is the ciphertext + salt + params (version,
  iterations, IV) — useless without the passphrase. Import requires the passphrase to open it.

## 5. PWA / offline
- Manifest + service worker cache the app shell for offline use. Since there is zero network
  by design, "offline" is simply the normal state.

## 6. Data safety & privacy
- 100% local, `localStorage` only, no network, no accounts, no telemetry.
- Re-emphasise: **only** salt/params/IV/ciphertext persisted; secrets live in memory only
  while unlocked.
- Export/import is the backup path and must be prominent (localStorage can be cleared).

## 7. Honest limitations (carry into the user guide)
- localStorage is device/browser-scoped — clearing browser data wipes the vault.
- Browser crypto is only as safe as the device/browser; not a hardware/certified vault.
- Positioned as a personal/family store for document and card *details*, not a bank-grade
  secrets manager — we won't imply otherwise.

## 8. Deferred / future (hooks noted)
- **Shipped since v1:** encrypted **attachments** (v1.1 — see §9).
- **Captured for v1.2** (see SPEC-requirements §10–§12): biometric unlock (WebAuthn/Face ID),
  custom entry types/categories with user-defined fields, and (store-app only) an unlock throttle.
- Still open: Argon2 KDF (behind a version flag so old PBKDF2 vaults still open); per-entry
  encryption; password generator; folders within types.
- Explicitly NOT planned: any sync/cloud (would break zero-network).

## 9. Attachments (v1.1) — design
Encrypted file attachments on any entry, built crypto-first in a prototype, then ported.

### 9.1 Storage engine — why IndexedDB
Binary files don't belong in localStorage (≈5 MB whole-origin budget; would risk the vault
blob). Attachments live in a **separate IndexedDB database** (`encrypto_attachments`, object
store `attachments`, keyed by `id`, indexed by `entryId`). The localStorage vault blob (§2.4)
is unchanged.

### 9.2 Record shape (all ciphertext or non-secret)
```
{ id, entryId, size, createdAt,
  name: { iv, ciphertext },    // filename encrypted (can be revealing)
  mime: { iv, ciphertext },    // MIME type encrypted
  data: { iv, ciphertext } }   // file bytes encrypted
```

### 9.3 Crypto reuse — binary variants
Added `encryptBytes(Uint8Array|ArrayBuffer, key)` / `decryptBytes({iv,ciphertext}, key)` to the
core, alongside the existing string `encrypt`/`decrypt`. Same AES-GCM-256 primitive, fresh IV
per item — raw bytes are encrypted directly (not base64-inflated first). Filename and MIME use
the existing string `encrypt`. The **in-memory vault key** is passed in per operation
(`EncryptoStore.getKey()`); with no key (locked) attachments are unreadable.

### 9.4 Behaviours
- Attachments allowed on **all four** entry types. A new entry gets a pre-generated id so files
  can be attached before the first save; abandoning the entry (cancel/close/esc/lock) cleans up
  the orphaned attachments.
- **5 MB per-file cap.** Over the cap: **images** can be downscaled/recompressed in-browser
  (canvas → JPEG, iterating scale/quality until under the cap, with a before/after confirm);
  **non-images** are rejected with "choose a smaller file" (no honest in-browser compression
  without a heavy dependency).
- **Image thumbnails** inline (decrypt → object URL → render → revoke on lock); non-images show
  a file-type glyph.
- **Unified preview:** every type opens via an object URL in a **new tab** (browser renders
  images/PDF/text; other types download). A preview launched from inside the app does **not**
  trip lock-on-background (a short one-shot grace window). Separate **download/save** action
  (share sheet on touch devices where available).
- **Backup:** attachments (the already-encrypted records) ride along in the encrypted
  export envelope (`exportVersion: 2`, `attachments: [...]`) and are restored on import.
- **Entry delete / vault wipe** cascade to the entry's attachments.

### 9.5 Verified
`tests/attachments-test.html` — 11 browser tests: binary round-trip, add→getBytes, no-plaintext
leak, listMeta, wrong-key, tamper, remove, removeForEntry, export/import, locked-rejection.

## 10. Update-ready prompt (v1.1.1+)
Service-worker-driven "A new version is ready — Update / Later" action toast.
- **Lock-aware (apply-on-next-lock):** never reloads a live *unlocked* vault. If unlocked, the
  update applies on the next lock (manual, idle, or "Lock & update"); if locked, applies now.
- Driven by a waiting service worker (`updatefound` → `statechange: installed`), activated via a
  `SKIP_WAITING` message then a single `controllerchange` reload.
- **Release discipline:** every release must bump `APP_VERSION` + SW `CACHE_NAME` together, or
  the prompt won't fire and installed PWAs serve stale assets.

## 11. Mobile layout (v1.1.2–v1.1.5)
- App shell is a **3-row CSS grid** (`grid-template-rows: auto 1fr auto` → topbar / scrolling
  screen / footer), explicit row placement so it holds whether or not the topbar is shown. The
  page itself doesn't scroll; the active screen's middle row does. Fixed footer at the bottom.
- **Viewport height:** `height: 100dvh` (with `100vh` fallback) so it fits under the mobile
  address bar on first paint.
- **iOS safe areas:** `viewport-fit=cover` + `env(safe-area-inset-*)` padding so the header
  clears the notch/status bar and the footer clears the home indicator. Requires the iOS
  web-app meta tags (`apple-mobile-web-app-capable`, `mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style = black-translucent`) for the insets to report real
  values — these are read when the PWA is (re)installed to the home screen.
