import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, mask, parseKey } from "./crypto";

const key = randomBytes(32);

describe("settings crypto", () => {
  it("round-trips", () => {
    const enc = encrypt("secret-token-1234", key, "entsoe.token");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("secret-token");
    expect(decrypt(enc, key, "entsoe.token")).toBe("secret-token-1234");
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("x", key, "a")).not.toBe(encrypt("x", key, "a"));
  });

  it("rejects a ciphertext moved to another setting (AAD)", () => {
    const enc = encrypt("secret", key, "entsoe.token");
    expect(() => decrypt(enc, key, "gridradar.token")).toThrow();
  });

  it("rejects a wrong key and tampering", () => {
    const enc = encrypt("secret", key, "k");
    expect(() => decrypt(enc, randomBytes(32), "k")).toThrow();
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[raw.length - 1]! ^= 1;
    expect(() => decrypt(`v1:${raw.toString("base64")}`, key, "k")).toThrow();
  });

  it("parses base64 and hex keys of exactly 32 bytes", () => {
    expect(parseKey(key.toString("base64")).equals(key)).toBe(true);
    expect(parseKey(key.toString("hex")).equals(key)).toBe(true);
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow();
    expect(() => parseKey(undefined)).toThrow();
  });

  it("masks secrets", () => {
    expect(mask("abcdefgh1234")).toBe("••••1234");
  });
});
