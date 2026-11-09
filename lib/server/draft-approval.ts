import { createHash } from "node:crypto";

export type DraftApprovalPayload = {
  subject: string;
  body: string;
  recipient: string;
  mailboxId: string;
};

/** Canonical approval fingerprint. Recipient and sender identity are part of the approval. */
export function createDraftApprovalHash(payload: DraftApprovalPayload): string {
  return createHash("sha256").update(JSON.stringify({
    subject: payload.subject,
    body: payload.body,
    recipient: payload.recipient.trim().toLowerCase(),
    mailboxId: payload.mailboxId
  })).digest("hex");
}
