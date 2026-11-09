// The legacy global Gmail self-test bypasses per-user OAuth mailbox ownership.
// Keep this entry point fail-closed until a dedicated mailbox-owned test harness
// is implemented with an explicitly approved test account.
throw new Error("Legacy global Gmail sending is disabled. Connect a mailbox through the Outreach Agent account flow.");
