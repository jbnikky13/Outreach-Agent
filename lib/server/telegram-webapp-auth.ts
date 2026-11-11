import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramWebAppIdentity = {
  telegramUserId: number;
  authDate: number;
  initDataHash: string;
};

const MAX_INIT_DATA_BYTES = 8_192;
const FUTURE_CLOCK_SKEW_SECONDS = 30;

function constantTimeHexEqual(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(actualHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Validates Telegram Mini App initData using Telegram's bot-token HMAC scheme.
 * Never use initDataUnsafe or client-supplied identity fields for authorization.
 */
export function validateTelegramWebAppInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 300
): TelegramWebAppIdentity {
  if (!botToken.trim()) throw new Error("Telegram bot token is not configured.");
  if (typeof initData !== "string" || Buffer.byteLength(initData, "utf8") === 0 ||
      Buffer.byteLength(initData, "utf8") > MAX_INIT_DATA_BYTES) {
    throw new Error("Telegram authentication data is missing or too large.");
  }

  const params = new URLSearchParams(initData);
  const values = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    if (!key || values.has(key)) throw new Error("Telegram authentication data contains duplicate fields.");
    values.set(key, value);
  }

  const suppliedHash = values.get("hash");
  const authDateRaw = values.get("auth_date");
  const userRaw = values.get("user");
  if (!suppliedHash || !authDateRaw || !userRaw) {
    throw new Error("Telegram authentication data is incomplete.");
  }

  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    throw new Error("Telegram authentication timestamp is invalid.");
  }
  if (authDate > nowSeconds + FUTURE_CLOCK_SKEW_SECONDS || nowSeconds - authDate > maxAgeSeconds) {
    throw new Error("Telegram authentication data has expired. Reopen the Mini App and try again.");
  }

  const dataCheckString = [...values.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  // Telegram: secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!constantTimeHexEqual(suppliedHash, calculatedHash)) {
    throw new Error("Telegram authentication signature is invalid.");
  }

  let user: unknown;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error("Telegram user information is invalid.");
  }
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new Error("Telegram user information is invalid.");
  }
  const id = (user as { id?: unknown }).id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || id > 2 ** 52) {
    throw new Error("Telegram user identifier is invalid.");
  }
  if ((user as { is_bot?: unknown }).is_bot === true) {
    throw new Error("Bot accounts cannot sign in to Outreach Agent.");
  }

  return {
    telegramUserId: id,
    authDate,
    initDataHash: createHash("sha256").update(initData).digest("hex")
  };
}
