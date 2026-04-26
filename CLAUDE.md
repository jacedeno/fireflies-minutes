# Fireflies Meeting Minutes Routine

You are a fully unattended routine. On every cron tick you drain a queue of pending meetings, generate structured minutes, and fan out the result to GitHub, Trilium, and email.

## Trigger

Cron `*/15 * * * *` (every 15 minutes). The queue is populated by a Cloudflare Worker that receives Fireflies `Meeting Transcribed` webhooks. The Worker writes one KV entry per meeting under the prefix `pending:`.

## Required environment variables

```
WORKER_BASE_URL              https://webhook.geekendzone.com
WORKER_ADMIN_TOKEN           shared secret used to call the Worker queue API

FIREFLIES_API_KEY            bearer token for api.fireflies.ai/graphql

GITHUB_TOKEN                 PAT with repo scope
GITHUB_OWNER                 GitHub username/org
GITHUB_REPO                  fireflies-minutes

TRILIUM_BASE_URL             https://trilium.geekendzone.com
TRILIUM_ETAPI_TOKEN          ETAPI token
TRILIUM_PARENT_NOTE_ID       parent note id under which meeting notes are created

RESEND_API_KEY               Resend API key
RESEND_FROM_EMAIL            verified sender (e.g. minutes@geekendzone.com)
MEETING_RECIPIENT_EMAIL      jacedeno@geekendzone.com
```

If any required variable is missing, log the missing name and exit non-zero. Never write partial state.

## Steps

### 1. Drain the queue

```
GET ${WORKER_BASE_URL}/queue
Authorization: Bearer ${WORKER_ADMIN_TOKEN}
```

Response is `{ "pending": [{ "id": "<meetingId>", "receivedAt": "<iso>" }, ...] }`. If `pending` is empty, log `queue empty, nothing to do` and exit 0.

### 2. For each pending meeting

Process one meeting at a time. A failure on one meeting must not block the others; leave its KV entry in place so the next tick retries, and continue with the next id.

#### 2a. Fetch the transcript

```
POST https://api.fireflies.ai/graphql
Authorization: Bearer ${FIREFLIES_API_KEY}
Content-Type: application/json

{
  "query": "query Transcript($id: String!) { transcript(id: $id) { id title date duration speakers { name email } summary { overview action_items keywords } sentences { text speaker_name start_time } } }",
  "variables": { "id": "<meetingId>" }
}
```

If the transcript is not yet available (404 or null `transcript`), leave the KV entry and continue.

#### 2b. Generate structured minutes

Apply your reasoning over the full transcript and produce this JSON shape exactly:

```json
{
  "metadata": {
    "meeting_date": "ISO-8601",
    "meeting_title": "string",
    "meeting_duration_minutes": 0,
    "attendees": ["string"],
    "fireflies_meeting_id": "string",
    "fireflies_transcript_url": "https://app.fireflies.ai/view/<id>"
  },
  "decisions": [
    {
      "id": "DEC-001",
      "decision_text": "string",
      "owner": "string",
      "priority": "high|medium|low",
      "timestamp": "MM:SS",
      "context": "2-3 sentences"
    }
  ],
  "action_items": [
    {
      "id": "TASK-001",
      "task": "string",
      "assigned_to": "string",
      "due_date": "YYYY-MM-DD or TBD",
      "priority": "high|medium|low",
      "acceptance_criteria": "string"
    }
  ],
  "executive_summary": "1 paragraph",
  "technical_summary": "2-3 paragraphs",
  "key_topics": ["string"],
  "follow_ups_needed": ["string"],
  "generated_at": "ISO-8601",
  "claude_routine_version": "2.0"
}
```

Rules:
- `decisions[].timestamp` is the `start_time` of the sentence that anchors the decision, formatted MM:SS.
- `decisions[].context` quotes at most 10 words from the transcript.
- `action_items[].due_date` is an ISO date if explicit in the transcript, otherwise `"TBD"`.
- IDs are zero-padded sequential within the meeting (`DEC-001`, `TASK-001`).
- If a section has no content, use `[]` (never `null`, never omit the key).

#### 2c. Render Markdown

Build a Markdown document from the JSON with these sections in order: title, metadata block, executive summary, technical summary, decisions, action items, key topics, follow-ups, footer with generation timestamp and Fireflies transcript link. Use `🔴 / 🟡 / 🟢` for high/medium/low priority badges.

#### 2d. Render HTML email

Same content as the Markdown, rendered as a single HTML document with inline styles only (no external CSS, no JS). Width capped at 640px. Tables for action items. Mobile-readable.

#### 2e. Commit to GitHub

For both files (`.json` and `.md`) at path `minutes/${YYYY}/${MM}/${YYYY}-${MM}-${DD}-${slug}.${ext}`:

```
PUT https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/<path>
Authorization: Bearer ${GITHUB_TOKEN}
Accept: application/vnd.github.v3+json

{
  "message": "chore: add minutes for \"<title>\" (<YYYY-MM-DD>)",
  "content": "<base64>",
  "branch": "main"
}
```

`slug` is the lowercased title with non-alphanumerics replaced by `-` and trimmed. If the file already exists (GET returns 200), include its `sha` so the PUT becomes an update.

#### 2f. Create Trilium note

```
POST ${TRILIUM_BASE_URL}/etapi/create-note
Authorization: ${TRILIUM_ETAPI_TOKEN}
Content-Type: application/json

{
  "parentNoteId": "${TRILIUM_PARENT_NOTE_ID}",
  "title": "<meeting_title> — <YYYY-MM-DD>",
  "type": "text",
  "content": "<HTML rendered from the Markdown>",
  "noteId": "fireflies-<meetingId>"
}
```

Setting `noteId` makes the call idempotent — re-runs update the same note. If the response is 4xx, log the body and skip Trilium for this meeting (but continue to email and queue cleanup).

#### 2g. Send email via Resend

```
POST https://api.resend.com/emails
Authorization: Bearer ${RESEND_API_KEY}
Content-Type: application/json

{
  "from": "${RESEND_FROM_EMAIL}",
  "to": ["${MEETING_RECIPIENT_EMAIL}"],
  "subject": "Meeting Minutes: <title> — <YYYY-MM-DD>",
  "html": "<rendered HTML>",
  "tags": [{ "name": "category", "value": "meeting-minutes" }]
}
```

#### 2h. Mark done

After GitHub + Trilium + Resend all succeed (Trilium failure is tolerable; GitHub and Resend failures are not):

```
DELETE ${WORKER_BASE_URL}/queue/<meetingId>
Authorization: Bearer ${WORKER_ADMIN_TOKEN}
```

### 3. Log a per-tick summary

End with a one-line summary: `processed=N skipped=M failed=K`.

## Failure policy

- Missing env var: exit non-zero immediately, no partial work.
- Fireflies transcript not ready: skip this meeting, keep KV entry, do not log as failure.
- GitHub or Resend failure: log error, keep KV entry, continue with the next meeting.
- Trilium failure: log warning, continue and still mark done (Trilium is best-effort secondary storage).
- Network timeouts: do not retry within a tick. The next cron tick is the retry mechanism.

## Idempotency

The same meeting can appear in the queue more than once if the Worker retried. The routine must produce the same end state regardless: GitHub PUT carries a `sha` for updates, Trilium uses a deterministic `noteId`, Resend will send a duplicate email (acceptable; it is rate-limited by the queue dedupe at the Worker level via 24h KV TTL).

## Out of scope

- Webhook signature verification (handled by the Worker).
- Multi-recipient CC.
- PDF generation.
- Slack/Teams delivery.
