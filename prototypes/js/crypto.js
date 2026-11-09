/*
 * Encrypto — crypto.js  [PROTOTYPE — v1.1.0-proto]
 * -----------------------------------------------------------------------------
 * Faithful copy of the shipped v1.0.0 crypto core, PLUS the v1.1 binary
 * encrypt/decrypt helpers (encryptBytes/decryptBytes) for attachments. When
 * v1.1 is finalised and signed off, this gets ported back into the live
 * js/crypto.js in one deliberate pass.
 *
 * All cryptography uses the NATIVE Web Crypto API (crypto.subtle) — no library,
 * no build step.
 *   - Key derivation: PBKDF2-SHA256, random 16-byte salt, ~310,000 iterations.
 *   - Encryption: AES-GCM 256-bit (authenticated), fresh random 12-byte IV.
 *   - Non-extractable key, in memory only; passphrase/key never persisted.
 * -----------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var PBKDF2_ITERATIONS = 310000;
  var PBKDF2_HASH = 'SHA-256';
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var AES_KEY_BITS = 256;

  function subtle() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new EncryptoCryptoError(
        'Web Crypto is unavailable. Encrypto must be served over HTTPS (or ' +
        'localhost) in a modern browser. It will not run with weakened crypto.'
      );
    }
    return global.crypto.subtle;
  }

  function EncryptoCryptoError(message, cause) {
    this.name = 'EncryptoCryptoError';
    this.message = message;
    if (cause) this.cause = cause;
  }
  EncryptoCryptoError.prototype = Object.create(Error.prototype);
  EncryptoCryptoError.prototype.constructor = EncryptoCryptoError;

  function randomBytes(n) {
    return global.crypto.getRandomValues(new Uint8Array(n));
  }

  function bytesToBase64(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return global.btoa(binary);
  }

  function base64ToBytes(b64) {
    var binary;
    try { binary = global.atob(b64); }
    catch (e) { throw new EncryptoCryptoError('Backup data is not valid base64.', e); }
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function utf8Encode(str) { return new TextEncoder().encode(str); }
  function utf8Decode(bytes) { return new TextDecoder().decode(bytes); }

  function deriveKey(passphrase, salt, iterations) {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      return Promise.reject(new EncryptoCryptoError('A passphrase is required.'));
    }
    var iter = iterations || PBKDF2_ITERATIONS;
    var s = subtle();
    return s.importKey('raw', utf8Encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (baseKey) {
        return s.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iter, hash: PBKDF2_HASH },
          baseKey,
          { name: 'AES-GCM', length: AES_KEY_BITS },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function encrypt(plaintext, key) {
    var iv = randomBytes(IV_BYTES);
    var data = utf8Encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, data)
      .then(function (buf) {
        return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(buf)) };
      }).catch(function (e) { throw new EncryptoCryptoError('Encryption failed.', e); });
  }

  function decrypt(payload, key) {
    if (!payload || typeof payload.iv !== 'string' || typeof payload.ciphertext !== 'string') {
      return Promise.reject(new EncryptoCryptoError('Malformed encrypted payload.'));
    }
    var iv, ct;
    try { iv = base64ToBytes(payload.iv); ct = base64ToBytes(payload.ciphertext); }
    catch (e) { return Promise.reject(e); }
    return subtle().decrypt({ name: 'AES-GCM', iv: iv }, key, ct)
      .then(function (buf) { return utf8Decode(new Uint8Array(buf)); })
      .catch(function (e) {
        throw new EncryptoCryptoError(
          'Could not decrypt: wrong passphrase or the data has been altered.', e
        );
      });
  }

  // --- v1.1: Binary encrypt / decrypt (for attachments) ---------------------
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

  function newSaltBase64() { return bytesToBase64(randomBytes(SALT_BYTES)); }

  var EncryptoCrypto = {
    ITERATIONS: PBKDF2_ITERATIONS,
    SALT_BYTES: SALT_BYTES,
    IV_BYTES: IV_BYTES,
    KEY_BITS: AES_KEY_BITS,
    HASH: PBKDF2_HASH,
    Error: EncryptoCryptoError,
    deriveKey: deriveKey,
    deriveKeyFromBase64Salt: function (passphrase, saltB64, iterations) {
      return deriveKey(passphrase, base64ToBytes(saltB64), iterations);
    },
    encrypt: encrypt,
    decrypt: decrypt,
    encryptBytes: encryptBytes,   // v1.1
    decryptBytes: decryptBytes,   // v1.1
    newSalt: function () { return randomBytes(SALT_BYTES); },
    newSaltBase64: newSaltBase64,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    randomBytes: randomBytes
  };

  global.EncryptoCrypto = EncryptoCrypto;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptoCrypto;
  }

})(typeof self !== 'undefined' ? self : this);
