import { describe, expect, it } from "vitest";
import { decryptCredentials, encryptCredentials, isEncryptionConfigured } from "../src/utils/encryption";

describe("encryption", () => {
  const hexKey = "0".repeat(64).replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));

  it("isEncryptionConfigured returns false when ENCRYPTION_KEY is unset", () => {
    expect(isEncryptionConfigured({})).toBe(false);
  });

  it("isEncryptionConfigured returns true when ENCRYPTION_KEY is 32+ chars", () => {
    expect(isEncryptionConfigured({ ENCRYPTION_KEY: hexKey })).toBe(true);
  });

  it("encryptCredentials returns plaintext when ENCRYPTION_KEY is unset", async () => {
    const plain = JSON.stringify({ apiToken: "secret" });
    const out = await encryptCredentials({}, plain);
    expect(out).toBe(plain);
  });

  it("decryptCredentials returns ciphertext as-is when ENCRYPTION_KEY is unset", async () => {
    const plain = JSON.stringify({ apiToken: "secret" });
    const out = await decryptCredentials({}, plain);
    expect(out).toBe(plain);
  });

  it("encrypt/decrypt roundtrip when ENCRYPTION_KEY is set", async () => {
    const env = { ENCRYPTION_KEY: hexKey };
    const plain = JSON.stringify({ apiToken: "test-token" });
    const encrypted = await encryptCredentials(env, plain);
    expect(encrypted).not.toBe(plain);
    const decrypted = await decryptCredentials(env, encrypted);
    expect(decrypted).toBe(plain);
  });
});
