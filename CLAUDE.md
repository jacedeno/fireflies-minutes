# Fireflies Meeting Minutes Routine

You are a fully unattended routine. When triggered by a Fireflies webhook (via the proxy Worker), you receive a single meetingId, fetch its transcript, generate structured minutes, and fan out the result to GitHub, Trilium, and email.

## Trigger

Event-driven via Claude Code Remote Trigger. A Cloudflare Worker at `webhook.geekendzone.net` receives Fireflies `Meeting Transcribed` webhooks, verifies the HMAC signature, extracts the meetingId, and fires this routine with the meetingId as the trigger text. Each invocation processes exactly one meeting.

## Required environment variables

```
FIREFLIES_API_KEY            bearer token for api.fireflies.ai/graphql

GITHUB_TOKEN                 PAT with repo scope
GITHUB_OWNER                 GitHub username/org
GITHUB_REPO                  fireflies-minutes

TRILIUM_BASE_URL             https://notes.geekendzone.net
TRILIUM_ETAPI_TOKEN          ETAPI token
TRILIUM_PARENT_NOTE_ID       parent note id under which meeting notes are created

RESEND_API_KEY               Resend API key
RESEND_FROM_EMAIL            verified sender (e.g. reports@support.cedeno.app)
MEETING_RECIPIENT_EMAIL      jacedeno@geekendzone.com
```

If any required variable is missing, log the missing name and exit non-zero. Never write partial state.

## Steps

### 1. Extract the meetingId

The trigger payload is a plain string containing the Fireflies meetingId. Read it from the trigger text. If the text is empty or missing, log `no meetingId in trigger payload` and exit 0.

### 2. Process the meeting

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

If the transcript is not yet available (404 or null `transcript`), retry up to 3 times with a 20-second delay between attempts. If still unavailable after 3 retries, log `transcript not ready after retries, meetingId=<id>` and exit 0. To retry later, re-deliver the webhook from the Fireflies dashboard.

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

Setting `noteId` makes the call idempotent — re-runs update the same note. If the response is 4xx, log the body and skip Trilium for this meeting (but continue to email).

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

### 3. Log result

End with: `processed=1 meetingId=<id>` on success, or the appropriate error.

## Failure policy

- Missing env var: exit non-zero immediately, no partial work.
- Fireflies transcript not ready: retry up to 3 times (20s apart). If still unavailable, log and exit 0. Re-deliver the webhook from the Fireflies dashboard to retry.
- GitHub or Resend failure: log error and exit non-zero. Re-deliver the webhook from Fireflies to retry.
- Trilium failure: log warning, continue to email. Trilium is best-effort secondary storage.

## Idempotency

Fireflies may re-deliver the webhook, causing duplicate invocations. The routine produces the same end state regardless: GitHub PUT carries a `sha` for updates, Trilium uses a deterministic `noteId` (`fireflies-<meetingId>`), and a duplicate email send is acceptable.

## Out of scope

- Webhook signature verification (handled by the proxy Worker).
- Multi-recipient CC.
- PDF generation.
- Slack/Teams delivery.
