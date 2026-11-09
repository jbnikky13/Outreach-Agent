// Legacy global-mailbox batch sending is intentionally disabled.
// All sends must pass through app/api/drafts/send, which binds the approved
// draft to the creator's own OAuth mailbox and enforces one-shot reconciliation.
throw new Error("Legacy batch sending is disabled. Use the per-user mailbox flow; do not restore global MAIL_* credentials.");
