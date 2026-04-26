# Deployment Guide

End-to-end deploy of the Fireflies meeting minutes routine.

Concrete domains used in this guide (substitute if you fork):
- Webhook receiver: `https://webhook.geekendzone.net`
- Trilium instance: `https://notes.geekendzone.net`
- Email sender domain: `support.cedeno.app`
- Email recipient: `jacedeno@geekendzone.com`
- GitHub repo: `jose-cedeno/fireflies-minutes`

## Prerequisites

- Fireflies account with API key + webhook permissions.
- Cloudflare account with `geekendzone.net` already added as a zone (so the custom domain in `worker/wrangler.toml` resolves).
- Node 18+ on this machine (only needed once, to run `wrangler`).
- A self-hosted Trilium instance reachable at `https://notes.geekendzone.net` with ETAPI enabled.
- Resend account with `support.cedeno.app` verified.
- Claude Code installed and signed in on a Pro/Max/Team/Enterprise plan.

## 1. Cloudflare Worker — step by step

### 1.1 Install wrangler and log in

```bash
cd /home/geekendzone/repos/fireflies-minutes/worker
npm install
npx wrangler login
```

The login opens a browser — authorize the account that owns `geekendzone.net`.

### 1.2 Create the KV namespace

```bash
npx wrangler kv namespace create fireflies-queue
```

The output looks like:

```
🌀  Creating namespace with title "fireflies-webhook-fireflies-queue"
✨  Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "QUEUE"
id = "abcd1234ef5678..."
```

Copy the `id` and paste it into `worker/wrangler.toml`, replacing the empty `id = ""` under `[[kv_namespaces]]`.

### 1.3 Generate the two shared secrets

Generate them once on this machine, then upload to the Worker. You will reuse the same values when configuring the Fireflies webhook (for `FIREFLIES_WEBHOOK_SECRET`) and the Claude routine (for `WORKER_ADMIN_TOKEN`).

```bash
openssl rand -hex 32   # → use as FIREFLIES_WEBHOOK_SECRET
openssl rand -hex 32   # → use as WORKER_ADMIN_TOKEN
```

Save both values into `.env` on this machine (under the `TODO:` lines I left for you), and then push them to the Worker:

```bash
npx wrangler secret put FIREFLIES_WEBHOOK_SECRET
# paste the first 64-char hex string when prompted

npx wrangler secret put WORKER_ADMIN_TOKEN
# paste the second 64-char hex string when prompted
```

### 1.4 Deploy

```bash
npx wrangler deploy
```

The output shows the deploy URL plus a line like `Custom domain webhook.geekendzone.net attached`. If the custom domain step fails, the zone `geekendzone.net` is not on this Cloudflare account — fix the zone, then re-run `npx wrangler deploy`.

### 1.5 Smoke test the Worker

```bash
TOKEN="<paste WORKER_ADMIN_TOKEN>"

# Empty queue, expected response: {"pending":[]}
curl -H "Authorization: Bearer $TOKEN" \
  https://webhook.geekendzone.net/queue
```

If you do not get `{"pending":[]}`, check `npx wrangler tail` while you re-issue the curl — the live log shows the Worker request.

## 2. Configure the Fireflies webhook

1. Fireflies dashboard → Settings → Developer → Webhooks → New webhook.
2. URL: `https://webhook.geekendzone.net/`
3. Secret: paste the same value you used for `FIREFLIES_WEBHOOK_SECRET`.
4. Events: `Transcription completed` only.
5. Save. Use "Send test" if available.
6. Verify the test entry was queued:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://webhook.geekendzone.net/queue
# → {"pending":[{"id":"<test_meeting_id>","receivedAt":"..."}]}
```

7. Clean up:

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://webhook.geekendzone.net/queue/<test_meeting_id>
```

## 3. Verify Resend sender

Already done in your case — `support.cedeno.app` is verified and `RESEND_API_KEY` is in `.env`. Confirm with one test send:

```bash
source .env
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "reports@support.cedeno.app",
    "to": ["jacedeno@geekendzone.com"],
    "subject": "Resend smoke test",
    "html": "<p>It works.</p>"
  }'
```

If you see a `403 The domain is not verified`, finish the SPF/DKIM/DMARC records in the Resend dashboard before continuing.

## 4. Trilium — get the parent note id

You already have the ETAPI token. You still need the `noteId` of the parent note where meeting minutes will live (e.g. `Meetings → Maintenance`).

In Trilium UI: open the parent note → click the note title → "Note Info" (or `Ctrl+I`) → copy `Note ID`.

Paste it into `.env` as `TRILIUM_PARENT_NOTE_ID`.

Smoke test the ETAPI:

```bash
source .env
curl -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  $TRILIUM_BASE_URL/etapi/app-info
```

Then create + delete a throwaway note to confirm write permissions on the parent:

```bash
NOTE_ID=$(curl -s -X POST $TRILIUM_BASE_URL/etapi/create-note \
  -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"parentNoteId\":\"$TRILIUM_PARENT_NOTE_ID\",\"title\":\"smoke test\",\"type\":\"text\",\"content\":\"<p>ok</p>\"}" \
  | jq -r '.note.noteId')

curl -X DELETE -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  $TRILIUM_BASE_URL/etapi/notes/$NOTE_ID
```

## 5. GitHub PAT

Already in `.env` (`GITHUB_TOKEN`). Sanity check it has access to the repo:

```bash
source .env
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO | jq '.full_name, .permissions'
```

You should see `"jose-cedeno/fireflies-minutes"` and a permissions block with `push: true`.

## 6. Create the Claude Code Routine

In Claude Code on this machine:

```
/schedule
```

Configure:
- Name: `fireflies-meeting-minutes`
- Cron: `*/15 * * * *`
- Prompt: paste the entire contents of `CLAUDE.md`.
- Secrets to add (copy each from `.env`):
  - `FIREFLIES_API_KEY`
  - `WORKER_BASE_URL`
  - `WORKER_ADMIN_TOKEN`
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `MEETING_RECIPIENT_EMAIL`
  - `GITHUB_TOKEN`
  - `GITHUB_OWNER`
  - `GITHUB_REPO`
  - `TRILIUM_BASE_URL`
  - `TRILIUM_ETAPI_TOKEN`
  - `TRILIUM_PARENT_NOTE_ID`

Run the routine once manually from the routine UI. Expected log line on an empty queue: `queue empty, nothing to do`.

## 7. End-to-end verification

1. Hold a 2-minute test meeting on Zoom with the Fireflies bot.
2. Wait for Fireflies to finish transcribing.
3. Within ~15 minutes confirm:
   - `git pull` on this repo shows a new minutes commit under `minutes/YYYY/MM/`.
   - Trilium shows a new child note under your parent note.
   - `jacedeno@geekendzone.com` received the HTML email.
4. Re-check `GET /queue` returns `{"pending":[]}`.

## Rotation and maintenance

- Rotate `FIREFLIES_WEBHOOK_SECRET`, `WORKER_ADMIN_TOKEN`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `TRILIUM_ETAPI_TOKEN` quarterly. Update both the Worker secrets and the routine secrets each time.
- Review routine logs weekly until the system has run cleanly for a month.
- KV entries auto-expire after 24h, so a stuck meeting cannot accumulate indefinitely.
