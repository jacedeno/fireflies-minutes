# Meeting Minutes Processing Routine

## Objective
Automatically process Fireflies meeting transcriptions and generate structured meeting minutes with action items, decisions, and executive summaries. Send formatted report via email using Resend API.

## Input
- Fireflies API webhook trigger with meeting transcription data
- Meeting metadata: date, title, attendees, duration
- Raw transcript text

## Processing Steps

### 1. Fetch Meeting Transcription
- Call Fireflies API to retrieve the latest meeting transcript
- Parse transcript structure to identify speakers and segments
- Extract meeting metadata (date, duration, attendees)

### 2. Analyze Content
Using Claude AI reasoning:
- Identify key decisions made during the meeting
- Extract action items with implicit/explicit owners
- Highlight technical topics discussed
- Determine meeting outcome (approval, discussion, escalation)
- Extract quotes for critical decisions (max 10 words each)

### 3. Generate Meeting Minutes (JSON Format)
```json
{
  "metadata": {
    "meeting_date": "ISO-8601 timestamp",
    "meeting_title": "string",
    "meeting_duration_minutes": "number",
    "attendees": ["list"],
    "fireflies_meeting_id": "string",
    "fireflies_transcript_url": "string"
  },
  "decisions": [
    {
      "id": "DEC-001",
      "decision_text": "string",
      "owner": "name",
      "priority": "high|medium|low",
      "timestamp": "MM:SS in recording",
      "context": "2-3 sentence explanation"
    }
  ],
  "action_items": [
    {
      "id": "TASK-001",
      "task": "string (clear, actionable)",
      "assigned_to": "name",
      "due_date": "YYYY-MM-DD or 'TBD'",
      "priority": "high|medium|low",
      "acceptance_criteria": "how to know it's complete"
    }
  ],
  "technical_summary": "2-3 paragraph summary of technical discussion",
  "executive_summary": "1 paragraph high-level meeting outcome",
  "key_topics": ["topic1", "topic2", "topic3"],
  "follow_ups_needed": ["string", "string"],
  "generated_at": "ISO-8601 timestamp",
  "claude_routine_version": "1.0"
}
```

### 4. Save to GitHub Repository
- Create commit with message: `chore: add meeting minutes for [MEETING_TITLE] [DATE]`
- File path: `minutes/YYYY/MM/YYYY-MM-DD-[meeting-slug].json`
- Include git author info

### 5. Generate HTML Report
- Convert JSON to formatted HTML email template
- Include:
  - Executive summary (top)
  - Decisions with owners
  - Action items (sorted by priority/due date)
  - Key topics
  - Link to Fireflies transcript

### 6. Send Email via Resend API
- Recipient: `$MEETING_RECIPIENT_EMAIL` (env var)
- CC: All attendees (if available)
- Subject: `Meeting Minutes: [MEETING_TITLE] - [DATE]`
- Template: HTML report
- Attachment: JSON file (optional)
- Tags: `["meeting-minutes", "maintenance"]`

## Required Environment Variables
```
FIREFLIES_API_KEY=re_xxx...         # Fireflies API key
RESEND_API_KEY=re_xxx...             # Resend email API key
RESEND_FROM_EMAIL=reports@yourdomain.com
GITHUB_TOKEN=ghp_xxx...              # GitHub token (for commits)
MEETING_RECIPIENT_EMAIL=jose@yourdomain.com
MEETING_ATTENDEES_JSON={}            # Optional: map attendee names to emails
```

## Error Handling
- If Fireflies API call fails, log error and exit (do not proceed)
- If GitHub commit fails, retry up to 3 times before failing
- If Resend API fails, save report locally and flag for manual review
- Always log execution details to console (for routine monitoring)

## Success Criteria
✅ Transcription fetched and parsed without errors
✅ Minutes JSON generated and validated
✅ File committed to GitHub successfully
✅ Email sent via Resend (or error logged)
✅ All metadata properly recorded

## Trigger
Webhook from Fireflies API OR scheduled daily at 2 PM (in case webhook fails)

## Notes for Routine Execution
- This routine runs completely unattended
- No confirmation needed between steps
- All output should be deterministic and idempotent
- Execution time limit: ~30 seconds per run
- Cost: Token usage for transcript analysis only (Fireflies data is external)
