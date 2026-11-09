// Legacy follow-up generation creates drafts without workspace and member-mailbox
// bindings. It must not run against the multi-workspace schema.
throw new Error("Legacy global follow-up generation is disabled. Workspace-scoped, per-user mailbox follow-ups are not yet implemented.");
