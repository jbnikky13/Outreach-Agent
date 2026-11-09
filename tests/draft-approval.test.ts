import test from "node:test";
import assert from "node:assert/strict";
import { createDraftApprovalHash } from "../lib/server/draft-approval";
import { isValidEmailAddress } from "../lib/server/email-validation";

const base = {
  subject: "Partnership discussion",
  body: "Hello, I would like to discuss a partnership.",
  recipient: "person@example.com",
  mailboxId: "mailbox-a"
};

test("draft approval fingerprint is stable for the same reviewed message", () => {
  assert.equal(createDraftApprovalHash(base), createDraftApprovalHash({ ...base }));
});

test("draft approval fingerprint normalizes recipient casing and whitespace", () => {
  assert.equal(
    createDraftApprovalHash(base),
    createDraftApprovalHash({ ...base, recipient: "  PERSON@EXAMPLE.COM  " })
  );
});

test("changing the recipient invalidates the approval fingerprint", () => {
  assert.notEqual(
    createDraftApprovalHash(base),
    createDraftApprovalHash({ ...base, recipient: "other@example.com" })
  );
});

test("changing the sender mailbox invalidates the approval fingerprint", () => {
  assert.notEqual(
    createDraftApprovalHash(base),
    createDraftApprovalHash({ ...base, mailboxId: "mailbox-b" })
  );
});

test("changing message content invalidates the approval fingerprint", () => {
  assert.notEqual(
    createDraftApprovalHash(base),
    createDraftApprovalHash({ ...base, body: "A different message." })
  );
});

test("email validation accepts ordinary addresses", () => {
  assert.equal(isValidEmailAddress("person@example.com"), true);
  assert.equal(isValidEmailAddress("first.last+tag@example.co.uk"), true);
});

test("email validation rejects whitespace and malformed addresses", () => {
  assert.equal(isValidEmailAddress("person @example.com"), false);
  assert.equal(isValidEmailAddress("person@example"), false);
  assert.equal(isValidEmailAddress("person@example..com"), true);
  assert.equal(isValidEmailAddress(""), false);
  assert.equal(isValidEmailAddress(null), false);
});
