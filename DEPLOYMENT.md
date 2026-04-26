# Deployment Guide

End-to-end deploy of the Fireflies meeting minutes routine. Estimated time: 30–45 minutes if all accounts are already created.

## Prerequisites

- Fireflies account with an API key and webhook permissions.
- Cloudflare account, with `geekendzone.com` (or your domain) added.
- A `wrangler` CLI logged in (`npx wrangler login`).
- A GitHub repo named `fireflies-minutes` (this one).
- A self-hosted Trilium instance reachable on HTTPS, with ETAPI enabled.
- A Resend account with `geekendzone.com` (or your sending domain) verified.
- Claude Code installed and signed in on a Pro/Max/Team/Enterprise plan.

## 1. Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler kv namespace create fireflies-queue
# Copy the returned `id` and paste it into wrangler.toml under [[kv_namespaces]] id = "..."

npx wrangler secret put FIREFLIES_WEBHOOK_SECRET
# paste the secret you will also configure in Fireflies

npx wrangler secret put WORKER_ADMIN_TOKEN
# generate a random 32-char token; you will reuse it in the routine

npx wrangler deploy
```

Note the deployed URL (e.g. `https://fireflies-webhook.<your-subdomain>.workers.dev`). You can attach a custom domain in the Cloudflare dashboard → Workers → your Worker → Triggers → Custom Domains. Recommended: `webhook.geekendzone.com`.

Smoke test:

```bash
curl -H "Authorization: Bearer $WORKER_ADMIN_TOKEN" \
  https://webhook.geekendzone.com/queue
# expect: {"pending":[]}
```

## 2. Configure the Fireflies webhook

1. Fireflies dashboard → Settings → Developer → Webhooks.
2. URL: `https://webhook.geekendzone.com/`
3. Secret: paste the same value you stored as `FIREFLIES_WEBHOOK_SECRET`.
4. Events: `Transcription completed` only.
5. Save.

Trigger the dashboard's "Send test" if available. Then:

```bash
curl -H "Authorization: Bearer $WORKER_ADMIN_TOKEN" \
  https://webhook.geekendzone.com/queue
# expect: {"pending":[{"id":"<test_meeting_id>","receivedAt":"..."}]}
```

Clean up the test entry:

```bash
curl -X DELETE -H "Authorization: Bearer $WORKER_ADMIN_TOKEN" \
  https://webhook.geekendzone.com/queue/<test_meeting_id>
```

## 3. Verify Resend sender

1. Resend → Domains → Add Domain → `geekendzone.com`.
2. Add the SPF / DKIM / DMARC DNS records to Cloudflare DNS. Wait for verification (usually <10 minutes).
3. Resend → API Keys → create a key with "Sending access" scope.
4. Pick a from-address on the verified domain, e.g. `minutes@geekendzone.com`.

Smoke test:

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "minutes@geekendzone.com",
    "to": ["jacedeno@geekendzone.com"],
    "subject": "Resend smoke test",
    "html": "<p>It works.</p>"
  }'
```

## 4. Trilium ETAPI

1. Trilium → Options → ETAPI → Create new ETAPI token. Copy it.
2. Pick (or create) the parent note where meeting minutes will live, e.g. `Meetings → Maintenance`. Open the note, copy its `noteId` from the URL or the note properties dialog.

Smoke test:

```bash
curl -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  https://trilium.geekendzone.com/etapi/app-info
# expect: JSON with appVersion, dbVersion, etc.
```

Create + delete a throwaway note to confirm write access:

```bash
NOTE_ID=$(curl -s -X POST https://trilium.geekendzone.com/etapi/create-note \
  -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"parentNoteId\":\"$TRILIUM_PARENT_NOTE_ID\",\"title\":\"smoke test\",\"type\":\"text\",\"content\":\"<p>ok</p>\"}" \
  | jq -r '.note.noteId')

curl -X DELETE -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  https://trilium.geekendzone.com/etapi/notes/$NOTE_ID
```

## 5. GitHub PAT

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Repository access: only `fireflies-minutes`.
3. Permissions: Contents → Read and write.
4. Generate, copy.

Smoke test:

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO
# expect: JSON describing the repo
```

## 6. Create the Claude Code Routine

In Claude Code:

```
/schedule
```

Configure:
- Name: `fireflies-meeting-minutes`
- Repository: `fireflies-minutes` (this repo)
- Cron: `*/15 * * * *`
- Prompt: paste the entire contents of `CLAUDE.md`.
- Secrets: add every variable from the table in `README.md` under "Environment variables" (the routine ones — Worker secrets stay in the Worker).

Run it once manually from the routine UI to confirm a clean tick logs `queue empty, nothing to do`.

## 7. End-to-end verification

1. Hold a 2-minute test meeting on Zoom with the Fireflies bot.
2. Watch Fireflies until the transcript is ready.
3. Within ~15 minutes confirm:
   - `git log` on this repo shows a new minutes commit.
   - Trilium shows a new child note under `TRILIUM_PARENT_NOTE_ID`.
   - `jacedeno@geekendzone.com` received the HTML email.
4. `curl /queue` returns `{"pending":[]}`.

## Rotation and maintenance

- Rotate `FIREFLIES_WEBHOOK_SECRET`, `WORKER_ADMIN_TOKEN`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `TRILIUM_ETAPI_TOKEN` quarterly. Update both the Worker secrets and the routine secrets each time.
- Review routine logs weekly until the system has run cleanly for a month.
- KV entries auto-expire after 24h, so a stuck meeting cannot accumulate indefinitely.
