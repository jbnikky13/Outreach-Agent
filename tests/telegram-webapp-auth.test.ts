import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validateTelegramWebAppInitData } from "../lib/server/telegram-webapp-auth";

const BOT_TOKEN = "123456:telegram-test-token";
const NOW = 1_800_000_000;

function makeInitData(overrides: Record<string, string> = {}) {
  const fields = new Map<string, string>([
    ["auth_date", String(NOW)],
    ["query_id", "AAEAAAE-test-query"],
    ["user", JSON.stringify({ id: 987654321, first_name: "Test" })],
    ...Object.entries(overrides)
  ]);
  const check = [...fields.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  fields.set("hash", hash);
  return new URLSearchParams([...fields.entries()]).toString();
}

test("accepts valid Telegram Mini App initData", () => {
  const result = validateTelegramWebAppInitData(makeInitData(), BOT_TOKEN, NOW);
  assert.equal(result.telegramUserId, 987654321);
  assert.equal(result.authDate, NOW);
  assert.match(result.initDataHash, /^[a-f0-9]{64}$/);
});

test("rejects altered payload", () => {
  const valid = makeInitData();
  const altered = valid.replace("987654321", "987654322");
  assert.throws(() => validateTelegramWebAppInitData(altered, BOT_TOKEN, NOW), /signature/i);
});

test("rejects stale authentication data", () => {
  assert.throws(() => validateTelegramWebAppInitData(makeInitData({ auth_date: String(NOW - 301) }), BOT_TOKEN, NOW), /expired/i);
});

test("rejects timestamps too far in the future", () => {
  assert.throws(() => validateTelegramWebAppInitData(makeInitData({ auth_date: String(NOW + 31) }), BOT_TOKEN, NOW), /expired/i);
});

test("rejects duplicate query parameters", () => {
  assert.throws(() => validateTelegramWebAppInitData(makeInitData() + "&auth_date=" + NOW, BOT_TOKEN, NOW), /duplicate/i);
});

test("rejects missing user information", () => {
  const fields = new Map<string, string>([["auth_date", String(NOW)]]);
  const check = "auth_date=" + NOW;
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  fields.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  assert.throws(() => validateTelegramWebAppInitData(new URLSearchParams([...fields.entries()]).toString(), BOT_TOKEN, NOW), /incomplete/i);
});

test("rejects bot identities", () => {
  const initData = makeInitData({ user: JSON.stringify({ id: 987654321, is_bot: true }) });
  assert.throws(() => validateTelegramWebAppInitData(initData, BOT_TOKEN, NOW), /Bot accounts/i);
});

test("rejects oversized payloads", () => {
  assert.throws(() => validateTelegramWebAppInitData("x".repeat(8193), BOT_TOKEN, NOW), /too large/i);
});
