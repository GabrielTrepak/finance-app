const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export type CryptoBundle = {
  saltB64: string; // PBKDF2 salt
};

export async function createSaltBundle(): Promise<CryptoBundle> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { saltB64: bufToB64(salt.buffer) };
}

export async function deriveKeyFromPassword(password: string, saltB64: string) {
  const salt = new Uint8Array(b64ToBuf(saltB64));
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(plain: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain)
  );

  // concat iv + cipher em base64
  const out = new Uint8Array(iv.byteLength + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.byteLength);

  return bufToB64(out.buffer);
}

export async function decryptText(payloadB64: string, key: CryptoKey): Promise<string> {
  const data = new Uint8Array(b64ToBuf(payloadB64));
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );

  return dec.decode(plainBuf);
}
