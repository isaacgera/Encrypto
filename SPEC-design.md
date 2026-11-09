# Encrypto — Design

- **Category:** Utility | **Tier:** Medium | **Status:** Built (Encrypto v1.1.0) — attachments shipped 31 Oct 2026

> This captures the agreed crypto model the build works against. Encrypto is the most
> security-sensitive app in the family, so these are decisions, not sketches. Re-confirmed in
> Plan mode at build kickoff (31 Oct 2026): auto-lock 5 min, clipboard clear 30 s, MIT, ©
> Isaac A Gera.

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
- v1 encrypts the **whole `entries` array as one blob** (simplest, safe). Per-entry
  encryption is a v2 refinement.

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

## 8. Deferred to v2+ (hooks noted)
- Argon2 KDF (behind a version flag so old PBKDF2 vaults still open).
- Per-entry encryption; password generator; attachments; folders/categories; biometric unlock.
- Explicitly NOT planned: any sync/cloud (would break zero-network).
