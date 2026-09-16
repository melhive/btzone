// BT Zone — end-to-end encryption
// ECDH (P-256) identity keys, one AES-GCM shared key derived per contact.
// Messages are encrypted before they ever go over the Bluetooth wire.
// A contact with no exchanged public key yet (e.g. manually typed in,
// never actually connected) is shown as "not yet encrypted" rather than
// silently sending plaintext under an encrypted-looking UI.
(function () {
  const subtle = window.crypto && window.crypto.subtle;
  const aesKeyCache = new Map(); // contactId -> CryptoKey

  async function generateIdentityKeyPair() {
    return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  }

  async function exportPublicKeyJwk(publicKey) {
    return subtle.exportKey('jwk', publicKey);
  }

  async function importPublicKeyJwk(jwk) {
    return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }

  async function deriveAesKey(myPrivateKey, peerPublicKeyJwk) {
    const peerKey = await importPublicKeyJwk(peerPublicKeyJwk);
    return subtle.deriveKey(
      { name: 'ECDH', public: peerKey },
      myPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function getSharedKey(contactId, myPrivateKey, peerPublicKeyJwk) {
    if (aesKeyCache.has(contactId)) return aesKeyCache.get(contactId);
    const key = await deriveAesKey(myPrivateKey, peerPublicKeyJwk);
    aesKeyCache.set(contactId, key);
    return key;
  }

  function bufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function b64ToBuf(b64) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }

  async function encryptText(aesKey, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const data = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext));
    return { iv: bufToB64(iv), data: bufToB64(data) };
  }

  async function decryptText(aesKey, payload) {
    const iv = b64ToBuf(payload.iv);
    const data = b64ToBuf(payload.data);
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
    return new TextDecoder().decode(plain);
  }

  // ---- Passphrase-based encryption for local backup files ----
  async function deriveKeyFromPassphrase(passphrase, salt) {
    const material = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptBackup(jsonString, passphrase) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPassphrase(passphrase, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(jsonString));
    return { v: 1, salt: bufToB64(salt), iv: bufToB64(iv), data: bufToB64(data) };
  }

  async function decryptBackup(container, passphrase) {
    const salt = b64ToBuf(container.salt);
    const key = await deriveKeyFromPassphrase(passphrase, salt);
    const iv = b64ToBuf(container.iv);
    const data = b64ToBuf(container.data);
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  }

  // ---- Simple local PIN lock (hash only — never store the PIN itself) ----
  async function hashPin(pin, salt) {
    const enc = new TextEncoder().encode(pin + ':' + salt);
    const digest = await subtle.digest('SHA-256', enc);
    return bufToB64(digest);
  }

  // ---- Safety number (key fingerprint) for out-of-band verification ----
  // Combines both parties' raw public key material (sorted so both sides
  // compute the same result) into a SHA-256 digest, formatted as grouped
  // digits — compare this in person or over a trusted channel to catch
  // a man-in-the-middle on the QR/handshake exchange.
  async function safetyNumber(myPublicKeyJwk, peerPublicKeyJwk) {
    const a = JSON.stringify({ x: myPublicKeyJwk.x, y: myPublicKeyJwk.y });
    const b = JSON.stringify({ x: peerPublicKeyJwk.x, y: peerPublicKeyJwk.y });
    const combined = [a, b].sort().join('|');
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(combined));
    const bytes = new Uint8Array(digest);
    let digits = '';
    for (let i = 0; i < 15; i++) digits += (bytes[i] % 10).toString();
    return digits.match(/.{1,5}/g).join(' ');
  }

  window.BTZoneCrypto = {
    supported: !!subtle,
    generateIdentityKeyPair, exportPublicKeyJwk, importPublicKeyJwk,
    getSharedKey, encryptText, decryptText,
    encryptBackup, decryptBackup, hashPin, safetyNumber
  };
})();
