# Deployment Guide

End-to-end deploy of the Fireflies meeting minutes routine.

Concrete domains used in this guide (substitute if you fork):
- Webhook receiver: `https://webhook.geekendzone.net`
- Trilium instance: `https://notes.geekendzone.net`
- Email sender domain: `support.cedeno.app`
- Email recipient: `jacedeno@geekendzone.com`
- GitHub repo: `jacedeno/fireflies-minutes`

## Prerequisites

- Fireflies account with API key + webhook permissions.
- Cloudflare account with `geekendzone.net` already added as a zone.
- Node 18+ on this machine (only needed once, to run `wrangler`).
- A self-hosted Trilium instance reachable at `https://notes.geekendzone.net` with ETAPI enabled.
- Resend account with `support.cedeno.app` verified.
- Claude Code account (Pro/Max/Team/Enterprise plan) with access to Routines.

## 1. Create the Claude Code Remote Trigger

1. Go to https://claude.ai/code/routines and click **New routine**.
2. Set up a **Cloud Environment** (Settings > Environments) with these secrets:
   - `FIREFLIES_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` = `reports@support.cedeno.app`
   - `MEETING_RECIPIENT_EMAIL` = `jacedeno@geekendzone.com`
   - `GITHUB_TOKEN`
   - `GITHUB_OWNER` = `jacedeno`
   - `GITHUB_REPO` = `fireflies-minutes`
   - `TRILIUM_BASE_URL` = `https://notes.geekendzone.net`
   - `TRILIUM_ETAPI_TOKEN`
   - `TRILIUM_PARENT_NOTE_ID`
3. Paste the entire contents of `CLAUDE.md` as the routine prompt.
4. Under **Select a trigger**, choose **API**.
5. Save. Claude Code will display:
   - A **trigger URL**: `https://api.anthropic.com/v1/claude_code/routines/<id>/fire`
   - A **bearer token** (shown once — save it immediately)
6. Copy both values. You will use them as Worker secrets in the next step.

## 2. Deploy the Cloudflare Worker

The Worker is a minimal HMAC proxy — it verifies the Fireflies webhook signature and forwards the meetingId to the Claude Code Remote Trigger.

### 2.1 Install wrangler and log in

```bash
cd worker
npm install
npx wrangler login
```

### 2.2 Set Worker secrets

```bash
# HMAC secret — must match the value in Fireflies webhook config
npx wrangler secret put FIREFLIES_WEBHOOK_SECRET

# Claude Code trigger URL from step 1
npx wrangler secret put ANTHROPIC_ROUTINE_URL

# Claude Code trigger bearer token from step 1
npx wrangler secret put ANTHROPIC_ROUTINE_TOKEN
```

### 2.3 Deploy

```bash
npx wrangler deploy
```

The output shows `Custom domain webhook.geekendzone.net attached`.

### 2.4 Smoke test the Worker

```bash
# Should return 401 (no signature) — confirms the Worker is alive
curl -X POST https://webhook.geekendzone.net/
```

## 3. Configure the Fireflies webhook

1. Fireflies dashboard > Settings > Developer > Webhooks > New webhook.
2. URL: `https://webhook.geekendzone.net/`
3. Secret: paste the same value you used for `FIREFLIES_WEBHOOK_SECRET`.
4. Events: `Meeting Transcribed` only.
5. Save. Use "Send test" if available.
6. Check the routine's run log in Claude Code — you should see an invocation.

## 4. Verify Resend sender

Already done — `support.cedeno.app` is verified and `RESEND_API_KEY` is in the routine environment. Confirm with one test send:

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

## 5. Trilium — get the parent note id

You already have the ETAPI token. You still need the `noteId` of the parent note where meeting minutes will live.

In Trilium UI: open the parent note > click the note title > "Note Info" (or `Ctrl+I`) > copy `Note ID`.

Smoke test the ETAPI:

```bash
source .env
curl -H "Authorization: $TRILIUM_ETAPI_TOKEN" \
  $TRILIUM_BASE_URL/etapi/app-info
```

## 6. GitHub PAT

Already in the routine environment (`GITHUB_TOKEN`). Sanity check:

```bash
source .env
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO | jq '.full_name, .permissions'
```

You should see `"jacedeno/fireflies-minutes"` and `push: true`.

## 7. End-to-end verification

1. Hold a 2-minute test meeting on Zoom with the Fireflies bot.
2. Wait for Fireflies to finish transcribing.
3. Within ~2 minutes confirm:
   - `git pull` on this repo shows a new minutes commit under `minutes/YYYY/MM/`.
   - Trilium shows a new child note under your parent note.
   - `jacedeno@geekendzone.com` received the HTML email.
4. Check the routine's run log in Claude Code for `processed=1`.

If nothing arrives, walk the pipeline backwards:
- Check the routine run log in Claude Code.
- Check `npx wrangler tail` on the Worker for errors.
- Check Fireflies webhook delivery logs.

## Rotation and maintenance

- Rotate `FIREFLIES_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `TRILIUM_ETAPI_TOKEN` quarterly.
- If the Remote Trigger token or URL needs rotation: delete the trigger in Claude Code, create a new one, update `ANTHROPIC_ROUTINE_URL` and `ANTHROPIC_ROUTINE_TOKEN` Worker secrets, redeploy.
- The Remote Trigger URL should be treated as a secret — do not share it publicly.
- Review routine logs weekly until the system has run cleanly for a month.
