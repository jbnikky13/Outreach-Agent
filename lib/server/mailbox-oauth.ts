import { createHash, randomBytes } from "node:crypto";
import { encryptMailboxToken } from "./mailbox-crypto";

export type MailProvider = "gmail" | "outlook";
export function mailboxBaseUrl(): string {
  const value = process.env.APP_BASE_URL?.trim();
  if (!value) throw new Error("APP_BASE_URL is not configured.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_BASE_URL must use HTTPS.");
  return url.origin;
}
export function mailboxCallbackUrl(provider: MailProvider): string {
  return mailboxBaseUrl() + "/api/mailboxes/oauth/callback/" + provider;
}
export function oauthConfig(provider: MailProvider) {
  if (provider === "gmail") {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"],
    };
  }
  const tenant = process.env.MICROSOFT_OAUTH_TENANT_ID?.trim() || "common";
  return {
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim() ?? "",
    authorizationEndpoint: "https://login.microsoftonline.com/" + encodeURIComponent(tenant) + "/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/" + encodeURIComponent(tenant) + "/oauth2/v2.0/token",
    scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Send"],
  };
}
export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}
export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}
export function encryptProviderTokens(accessToken: string, refreshToken: string) {
  return {
    access_token_ciphertext: encryptMailboxToken(accessToken),
    refresh_token_ciphertext: encryptMailboxToken(refreshToken),
  };
}
export function safeProvider(provider: string): provider is MailProvider {
  return provider === "gmail" || provider === "outlook";
}
