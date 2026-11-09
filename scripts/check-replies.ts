// Legacy reply sync uses process-wide MAIL_* credentials and cannot safely
// resolve a member-owned mailbox or enforce workspace-scoped thread matching.
// Keep this entry point fail-closed until reply sync is rebuilt per mailbox.
throw new Error("Legacy global-mailbox reply sync is disabled. Per-user mailbox reply synchronization is not yet implemented.");
