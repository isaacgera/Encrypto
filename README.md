# Encrypto

A private, locally-encrypted vault for documents, passwords and card details.
Local-first, zero-network, installable PWA — **nothing ever leaves your device.**

Unlock with a single master passphrase. Everything you store is encrypted at rest
in your browser using the native Web Crypto API (PBKDF2-SHA256 → AES-GCM-256).

## Features
- Master-passphrase vault; entries across Document, Password, Card and Note types
- Client-side encryption (nothing stored in plaintext)
- Search & filter; masked fields with reveal; copy-to-clipboard with 30-second auto-clear
- Auto-lock after 5 minutes idle and on tab-hide/background
- Encrypted export / import backup
- Light/dark theme; accessible; works fully offline once installed

## Run locally
Encrypto needs a secure context (HTTPS or `localhost`) for Web Crypto — it will not
run from `file://`. Serve the folder, e.g.:

```
python -m http.server 8000
```

then open `http://localhost:8000/`.

## Tests
Open in a browser (over `localhost`):
- `tests/crypto-test.html` — crypto core
- `tests/store-test.html` — vault store

## The one rule
**There is no recovery.** Your passphrase is the only key. If you forget it, your data
is permanently unreadable — by design (no reset, no backdoor). Keep an encrypted export
as a backup, and store your passphrase somewhere safe.

Encrypto protects your data **at rest**; it is not a hardware vault and cannot protect a
compromised device or a weak passphrase.

---
Powered by Forjé · © 2026 Isaac A Gera. All rights reserved. · [MIT License](LICENSE)
