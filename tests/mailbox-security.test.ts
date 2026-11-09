import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decryptMailboxToken, encryptMailboxToken } from "../lib/server/mailbox-crypto";
import { createOAuthState, createPkcePair, hashOAuthState } from "../lib/server/mailbox-oauth";

const originalKey = process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
const testKey = Buffer.alloc(32, 7).toString("base64");

test("mailbox tokens encrypt and decrypt without storing plaintext", () => {
  process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = testKey;
  const token = "refresh-token-test-value";
  const envelope = encryptMailboxToken(token);
  assert.notEqual(envelope, token);
  assert.equal(decryptMailboxToken(envelope), token);
});

test("mailbox token envelope rejects tampering", () => {
  process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = testKey;
  const envelope = encryptMailboxToken("sensitive-token");
  const parts = envelope.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => decryptMailboxToken(parts.join(".")));
});

test("mailbox token encryption rejects malformed key material", () => {
  process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = "not-a-32-byte-key";
  assert.throws(() => encryptMailboxToken("token"));
});

test("OAuth state is high entropy and hashed before database persistence", () => {
  const state = createOAuthState();
  assert.ok(state.length >= 40);
  assert.equal(hashOAuthState(state), createHash("sha256").update(state).digest("hex"));
  assert.notEqual(hashOAuthState(state), state);
});

test("OAuth PKCE challenge uses SHA-256 S256 encoding", () => {
  const pair = createPkcePair();
  const expected = createHash("sha256").update(pair.verifier).digest("base64url");
  assert.equal(pair.challenge, expected);
  assert.ok(pair.verifier.length >= 43);
});

test.after(() => {
  if (originalKey === undefined) delete process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
  else process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = originalKey;
});
