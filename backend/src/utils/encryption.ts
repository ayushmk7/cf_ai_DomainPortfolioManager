/**
 * AES-256-GCM encryption for provider credentials and API keys at rest.
 * Requires ENCRYPTION_KEY (32-byte hex or base64) as Wrangler secret.
 * When ENCRYPTION_KEY is not set, returns plaintext (backward compat; not for production).
 */

const ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

async function getKeyMaterial(env: { ENCRYPTION_KEY?: string }): Promise<CryptoKey | null> {
  const raw = env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) return null;
  let bytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  } else {
    try {
      bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  }
  if (bytes.length < 32) return null;
  return crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: ALGO, length: KEY_LENGTH }, false, ["encrypt", "decrypt"]);
}

export async function encryptCredentials(env: { ENCRYPTION_KEY?: string }, plaintext: string): Promise<string> {
  const key = await getKeyMaterial(env);
  if (!key) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: ALGO, iv, tagLength: 128 },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + (cipher as ArrayBuffer).byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptCredentials(env: { ENCRYPTION_KEY?: string }, ciphertext: string): Promise<string> {
  const key = await getKeyMaterial(env);
  if (!key) return ciphertext;
  try {
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    if (combined.length < IV_LENGTH + 16) return ciphertext;
    const iv = combined.slice(0, IV_LENGTH);
    const cipher = combined.slice(IV_LENGTH);
    const dec = await crypto.subtle.decrypt(
      { name: ALGO, iv, tagLength: 128 },
      key,
      cipher,
    );
    return new TextDecoder().decode(dec);
  } catch {
    return ciphertext;
  }
}

export function isEncryptionConfigured(env: { ENCRYPTION_KEY?: string }): boolean {
  const raw = env.ENCRYPTION_KEY;
  return !!(raw && raw.length >= 32);
}
