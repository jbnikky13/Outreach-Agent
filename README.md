# Outreach Agent

AI-assisted personal outreach with a human approval gate before any email is sent.

## Current MVP
- Dashboard with outreach metrics
- Prospect pipeline
- AI draft review drawer
- Explicit **Approve & send** action
- Activity feed
- Responsive UI

## Roadmap
1. Supabase persistence
2. Authenticated email provider connection
3. AI drafting and personalization
4. Reply/thread sync
5. Follow-up scheduling with stop-on-reply logic
6. Production hardening and deployment

## Safety model
Drafting and sending are separate capabilities. The initial product keeps sending behind explicit user approval.

## Development
npm install
npm run dev
