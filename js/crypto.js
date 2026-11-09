/*
 * Encrypto — crypto.js
 * -----------------------------------------------------------------------------
 * The security core. All cryptography uses the NATIVE Web Crypto API
 * (crypto.subtle) — no third-party library, no build step.
 *
 * Model (agreed in SPEC-design.md §2):
 *   - Key derivation: PBKDF2-SHA256, random 16-byte per-vault salt,
 *     ~310,000 iterations (OWASP-aligned). Iteration count is stored so it can
 *     be raised later without breaking existing vaults.
 *   - Encryption: AES-GCM 256-bit (authenticated — confidentiality + tamper
 *     detection). Fresh random 12-byte IV per encryption. IV never reused.
 *   - The derived key is a NON-EXTRACTABLE CryptoKey, held in memory only.
 *     The passphrase is never stored; the derived key is never persisted.
 *   - Unlock = attempt to decrypt. AES-GCM's auth tag makes a wrong passphrase
 *     and tampered/corrupt data both fail cleanly.
 *
 * Nothing in this module touches the DOM, localStorage, or the network. It is a
 * pure crypto boundary so it can be unit-tested in isolation.
 * -----------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // --- Parameters (agreed) --------------------------------------------------
  var PBKDF2_ITERATIONS = 310000; // OWASP-aligned for PBKDF2-SHA256 (2023+)
  var PBKDF2_HASH = 'SHA-256';
  var SALT_BYTES = 16;            // 128-bit salt
  var IV_BYTES = 12;              // 96-bit IV, the recommended size for AES-GCM
  var AES_KEY_BITS = 256;

  // Guard: Web Crypto must be present. On http:// (non-localhost) or very old
  // browsers, crypto.subtle is undefined — fail loud rather than silently weak.
  function subtle() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new EncryptoCryptoError(
        'Web Crypto is unavailable. Encrypto must be served over HTTPS (or ' +
        'localhost) in a modern browser. It will not run with weakened crypto.'
      );
    }
    return global.crypto.subtle;
  }

  // --- Error type -----------------------------------------------------------
  // A dedicated error type so callers can distinguish "wrong passphrase /
  // tampered data" from programming errors.
  function EncryptoCryptoError(message, cause) {
    this.name = 'EncryptoCryptoError';
    this.message = message;
    if (cause) this.cause = cause;
  }
  EncryptoCryptoError.prototype = Object.create(Error.prototype);
  EncryptoCryptoError.prototype.constructor = EncryptoCryptoError;

  // --- Byte / base64 helpers ------------------------------------------------
  function randomBytes(n) {
    return global.crypto.getRandomValues(new Uint8Array(n));
  }

  // Base64 <-> Uint8Array. We use base64 (not base64url) for storage; it is the
  // standard btoa/atob alphabet and round-trips cleanly through JSON.
  function bytesToBase64(bytes) {
    var binary = '';
    var chunk = 0x8000; // avoid call-stack limits on large inputs
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null, bytes.subarray(i, i + chunk)
      );
    }
    return global.btoa(binary);
  }

  function base64ToBytes(b64) {
    var binary;
    try {
      binary = global.atob(b64);
    } catch (e) {
      throw new EncryptoCryptoError('Backup data is not valid base64.', e);
    }
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function utf8Encode(str) {
    return new TextEncoder().encode(str);
  }

  function utf8Decode(bytes) {
    return new TextDecoder().decode(bytes);
  }

  // --- Key derivation -------------------------------------------------------
  // Derive a non-extractable AES-GCM key from a passphrase + salt + iterations.
  // extractable:false means the raw key bytes can never be read back out, even
  // by our own code — the key exists only as an opaque CryptoKey in memory.
  function deriveKey(passphrase, salt, iterations) {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      return Promise.reject(
        new EncryptoCryptoError('A passphrase is required.')
      );
    }
    var iter = iterations || PBKDF2_ITERATIONS;
    var s = subtle();
    return s.importKey(
      'raw',
      utf8Encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ).then(function (baseKey) {
      return s.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: iter,
          hash: PBKDF2_HASH
        },
        baseKey,
        { name: 'AES-GCM', length: AES_KEY_BITS },
        false,              // non-extractable
        ['encrypt', 'decrypt']
      );
    });
  }

  // --- Encrypt / decrypt ----------------------------------------------------
  // encrypt(plaintextString, key) -> { iv, ciphertext } as base64 strings.
  // A fresh random IV is generated for every call and returned alongside the
  // ciphertext (the IV is not secret, but must be unique per key).
  function encrypt(plaintext, key) {
    var iv = randomBytes(IV_BYTES);
    var data = utf8Encode(typeof plaintext === 'string'
      ? plaintext
      : JSON.stringify(plaintext));
    return subtle().encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    ).then(function (buf) {
      return {
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(buf))
      };
    }).catch(function (e) {
      throw new EncryptoCryptoError('Encryption failed.', e);
    });
  }

  // decrypt({ iv, ciphertext }, key) -> plaintext string.
  // Throws EncryptoCryptoError on a wrong key OR tampered/corrupt data — the
  // AES-GCM auth tag check fails identically for both, which is exactly what we
  // want for "unlock by attempting to decrypt".
  function decrypt(payload, key) {
    if (!payload || typeof payload.iv !== 'string' ||
        typeof payload.ciphertext !== 'string') {
      return Promise.reject(
        new EncryptoCryptoError('Malformed encrypted payload.')
      );
    }
    var iv, ct;
    try {
      iv = base64ToBytes(payload.iv);
      ct = base64ToBytes(payload.ciphertext);
    } catch (e) {
      return Promise.reject(e);
    }
    return subtle().decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ct
    ).then(function (buf) {
      return utf8Decode(new Uint8Array(buf));
    }).catch(function (e) {
      // Do NOT leak detail — wrong passphrase and tampering look the same.
      throw new EncryptoCryptoError(
        'Could not decrypt: wrong passphrase or the data has been altered.', e
      );
    });
  }

  // --- Binary encrypt / decrypt (attachments, v1.1) -------------------------
  // Takes RAW BYTES rather than a string so file data isn't base64-inflated
  // (~33%) before encryption. Same AES-GCM primitive, fresh IV per call.
  function encryptBytes(bytes, key) {
    var data;
    if (bytes instanceof ArrayBuffer) data = new Uint8Array(bytes);
    else if (bytes instanceof Uint8Array) data = bytes;
    else return Promise.reject(
      new EncryptoCryptoError('encryptBytes expects a Uint8Array or ArrayBuffer.')
    );
    var iv = randomBytes(IV_BYTES);
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, data)
      .then(function (buf) {
        return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(buf)) };
      }).catch(function (e) { throw new EncryptoCryptoError('Encryption failed.', e); });
  }

  function decryptBytes(payload, key) {
    if (!payload || typeof payload.iv !== 'string' || typeof payload.ciphertext !== 'string') {
      return Promise.reject(new EncryptoCryptoError('Malformed encrypted payload.'));
    }
    var iv, ct;
    try { iv = base64ToBytes(payload.iv); ct = base64ToBytes(payload.ciphertext); }
    catch (e) { return Promise.reject(e); }
    return subtle().decrypt({ name: 'AES-GCM', iv: iv }, key, ct)
      .then(function (buf) { return new Uint8Array(buf); })
      .catch(function (e) {
        throw new EncryptoCryptoError(
          'Could not decrypt: wrong passphrase or the data has been altered.', e
        );
      });
  }

  // --- Salt helpers ---------------------------------------------------------
  // Generate a new random salt (returned as base64 for storage).
  function newSaltBase64() {
    return bytesToBase64(randomBytes(SALT_BYTES));
  }

  // --- Public API -----------------------------------------------------------
  var EncryptoCrypto = {
    // constants (read-only intent)
    ITERATIONS: PBKDF2_ITERATIONS,
    SALT_BYTES: SALT_BYTES,
    IV_BYTES: IV_BYTES,
    KEY_BITS: AES_KEY_BITS,
    HASH: PBKDF2_HASH,

    Error: EncryptoCryptoError,

    // key derivation: pass salt as Uint8Array
    deriveKey: deriveKey,
    // convenience: derive from base64 salt string
    deriveKeyFromBase64Salt: function (passphrase, saltB64, iterations) {
      return deriveKey(passphrase, base64ToBytes(saltB64), iterations);
    },

    encrypt: encrypt,
    decrypt: decrypt,

    // binary variants (v1.1 attachments)
    encryptBytes: encryptBytes,
    decryptBytes: decryptBytes,

    newSalt: function () { return randomBytes(SALT_BYTES); },
    newSaltBase64: newSaltBase64,

    // exposed for tests / backup encoding
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    randomBytes: randomBytes
  };

  // UMD-ish export: attach to window, and support module systems if present.
  global.EncryptoCrypto = EncryptoCrypto;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptoCrypto;
  }

})(typeof self !== 'undefined' ? self : this);
