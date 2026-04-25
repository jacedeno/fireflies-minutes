# Fireflies Meeting Minutes Routine

A Claude Code Routine that automatically processes Fireflies meeting transcriptions, generates structured meeting minutes with decisions and action items, and sends formatted reports via email using Resend API.

**Status**: Ready for production | **Language**: English | **Runtime**: Node.js 18+

---

## Features

✅ **Automatic Transcription Processing**
- Fetches latest meeting from Fireflies API
- Parses transcript for key decisions and action items
- Extracts attendee information and meeting metadata

✅ **Intelligent Analysis**
- Identifies decisions with owners and priority levels
- Extracts structured action items with due dates
- Generates executive summaries and technical overviews
- Detects key topics and follow-up items

✅ **Multi-channel Delivery**
- Saves structured JSON minutes to GitHub repository
- Generates professional HTML email report
- Sends via Resend API with recipient CC/BCC support
- Maintains complete audit trail

✅ **Unattended Execution**
- Runs on schedule (daily, weekly, or custom cron)
- Also supports Fireflies webhook triggers
- Requires no local machine - runs on Claude Code infrastructure
- Handles errors gracefully with detailed logging

---

## Quick Start

### 1. Prerequisites

- ✅ Fireflies account with API access
- ✅ Resend account with verified domain
- ✅ GitHub repository for storing minutes
- ✅ Claude Code access (Pro/Max/Team/Enterprise plan)

### 2. Get API Keys

#### Fireflies API Key
```bash
# Visit: https://app.fireflies.ai/settings/api
# Create new API key
# Copy to safe location
```

#### Resend API Key
```bash
# Visit: https://resend.com/api-keys
# Click "Create API Key"
# Verify your domain in Resend dashboard
# Copy API key
```

#### GitHub Token
```bash
# Visit: https://github.com/settings/tokens
# Click "Generate new token" (classic)
# Scopes: repo (full control)
# Name: "Fireflies Routine"
# Copy token
```

### 3. Clone and Configure

```bash
# Clone this repository to your local machine
git clone https://github.com/your-username/fireflies-minutas.git
cd fireflies-minutas

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
# Or use your editor of choice

# Verify settings
# - FIREFLIES_API_KEY=re_xxx...
# - RESEND_API_KEY=re_xxx...
# - GITHUB_TOKEN=ghp_xxx...
# - MEETING_RECIPIENT_EMAIL=your-email@domain.com
```

### 4. Create Claude Code Routine

#### Option A: Via Claude Web Interface (Easiest)

1. Go to `https://claude.ai/code/routines`
2. Click **"New Routine"**
3. Configure:
   - **Repository**: Select `fireflies-minutas`
   - **Prompt**: Copy entire content from `CLAUDE.md`
   - **Branch**: `main`
   - **Trigger Type**: Schedule
   - **Schedule**: `0 14 * * *` (daily at 2 PM UTC)
   - **Connectors**: Add Fireflies API, Resend API, GitHub
4. Review settings and click **"Create Routine"**

#### Option B: Via CLI (Advanced)

```bash
# In Claude Code terminal on your local machine
cd ~/path/to/fireflies-minutas
claude

# Inside Claude Code session:
/schedule

# Follow prompts to create routine
# 1. Paste CLAUDE.md content as prompt
# 2. Select repo: fireflies-minutas
# 3. Trigger type: Schedule
# 4. Frequency: Daily at 14:00 (or custom)
# 5. Confirm and save
```

### 5. Test the Routine

Before relying on automatic execution, test manually:

```bash
# Set environment variables
export FIREFLIES_API_KEY=your_key
export RESEND_API_KEY=your_key
export GITHUB_TOKEN=your_token
export MEETING_RECIPIENT_EMAIL=your_email

# Run routine locally
node routine.js

# Expected output:
# ═══════════════════════════════════════════════════════════════
#   Meeting Minutes Processing Routine - Starting Execution
# ═══════════════════════════════════════════════════════════════
# 
# [FIREFLIES] Fetching latest meeting transcript...
# [FIREFLIES] Retrieved: "Maintenance Meeting" (45 min)
# [PARSER] Analyzing transcript...
# [GITHUB] Saving meeting minutes to repository...
# [RESEND] Sending email report...
# 
# ✅ Routine Completed Successfully
```

---

## How It Works

### Execution Flow

```
1. Routine triggered by schedule or webhook
2. Fetch latest Fireflies transcript
3. Parse for decisions and action items
4. Generate structured JSON minutes
5. Create professional HTML report
6. Save minutes to GitHub (minutes/YYYY/MM/DD-*.json)
7. Send report via Resend email API
8. Log execution details
```

### Output Files

After each execution, you'll have:

**1. GitHub Commit**
```
File: minutes/2025/04/2025-04-24-maintenance-meeting.json
Content:
{
  "metadata": {...},
  "decisions": [...],
  "action_items": [...],
  "technical_summary": "...",
  "executive_summary": "..."
}
```

**2. Email Report**
- Recipient: Your configured email address
- Format: Professional HTML with styled tables
- Includes: Executive summary, decisions, action items, transcript link
- Tags: `meeting-minutes`, `maintenance`

### Data Structure

Meeting minutes are saved as JSON:

```json
{
  "metadata": {
    "meeting_date": "2025-04-24T14:30:00Z",
    "meeting_title": "Maintenance Meeting",
    "meeting_duration_minutes": 45,
    "attendees": ["Jose", "Tech Team"],
    "fireflies_meeting_id": "...",
    "fireflies_transcript_url": "https://app.fireflies.ai/..."
  },
  "decisions": [
    {
      "id": "DEC-001",
      "decision_text": "Upgrade HiveMQ to latest version",
      "owner": "Jose",
      "priority": "high",
      "timestamp": "12:34",
      "context": "..."
    }
  ],
  "action_items": [
    {
      "id": "TASK-001",
      "task": "Test HiveMQ upgrade in staging",
      "assigned_to": "Jose",
      "due_date": "2025-04-28",
      "priority": "high",
      "acceptance_criteria": "..."
    }
  ],
  "technical_summary": "...",
  "executive_summary": "...",
  "key_topics": ["HiveMQ", "Backup Strategy"],
  "follow_ups_needed": ["..."],
  "generated_at": "2025-04-24T15:45:00Z"
}
```

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `FIREFLIES_API_KEY` | Fireflies API authentication key | `re_abc123...` |
| `RESEND_API_KEY` | Resend email API key | `re_xyz789...` |
| `RESEND_FROM_EMAIL` | Sender email address (must be verified in Resend) | `reports@company.com` |
| `GITHUB_TOKEN` | GitHub personal access token with `repo` scope | `ghp_abc123...` |
| `MEETING_RECIPIENT_EMAIL` | Primary recipient for meeting reports | `jose@company.com` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_OWNER` | GitHub username or organization | (auto-detected) |
| `GITHUB_REPO` | Repository name for storing minutes | `fireflies-minutas` |
| `ROUTINE_SCHEDULE` | Cron schedule for execution | `0 14 * * *` |
| `ROUTINE_TIMEZONE` | Timezone for schedule (IANA format) | `UTC` |
| `MEETING_ATTENDEES_JSON` | JSON mapping of names to emails | `{}` |

### Security Notes

- **Never commit `.env` file** to version control
- Store API keys in Claude Code secrets (encrypted)
- Use GitHub organization/team settings for sensitive repos
- Rotate API keys monthly in production
- Use separate keys for testing vs production

---

## Customization

### Change Meeting Title Pattern

Edit in `routine.js`, function `saveToGitHub()`:

```javascript
// Currently matches any meeting starting with "Maintenance"
// Modify the query in parseTranscript() to filter differently

// Example: Only process meetings with "IIoT" in title
const transcript = data.data?.transcripts?.find(
  t => t.title.includes('IIoT')
);
```

### Modify Email Template

HTML template is in function `generateHtmlReport()` in `routine.js`.

Example: Add custom company logo

```html
<img src="https://company.com/logo.png" alt="Company Logo" style="max-width: 200px; margin-bottom: 20px;">
```

### Change Output Directory Structure

In `saveToGitHub()` function:

```javascript
// Current: minutes/YYYY/MM/DD-slug.json
// Change to: minutes/YYYY-MM-DD/slug.json or minutes/slug.json

const filePath = `minutes/${slug}.json`; // Flat structure
```

### Add Custom Analysis Fields

In `parseTranscript()` function, add new fields:

```javascript
parsed.budget_impact = 'TBD',
parsed.timeline = 'TBD',
parsed.risk_assessment = 'TBD',
```

Then update JSON schema in `CLAUDE.md` to document new fields.

---

## Troubleshooting

### "FIREFLIES_API_KEY not set"
```bash
# Solution: Ensure .env file is loaded
export FIREFLIES_API_KEY=$(grep FIREFLIES_API_KEY .env | cut -d= -f2)
```

### "No transcripts found in Fireflies"
- Check that Fireflies has processed your meeting
- Wait 5-10 minutes after meeting ends for transcription
- Verify API key has correct permissions

### "Failed to save to GitHub"
- Verify GITHUB_TOKEN has `repo` scope
- Check repository exists and is accessible
- Ensure branch is `main` (not `master`)

### "Email not sent (Resend API error)"
- Verify domain is verified in Resend dashboard
- Check `RESEND_FROM_EMAIL` matches verified domain
- Confirm `MEETING_RECIPIENT_EMAIL` is valid
- Check Resend dashboard for delivery logs

### Routine doesn't execute on schedule
- Verify schedule format is valid cron syntax
- Check Claude Code account usage limits
- Ensure timezone is set correctly
- Review execution logs at claude.ai/code/routines

---

## Production Checklist

- [ ] All API keys stored in Claude Code secrets (encrypted)
- [ ] `.env` file excluded from git (`echo .env >> .gitignore`)
- [ ] Fireflies meeting tested and processed correctly
- [ ] Email received at primary recipient address
- [ ] GitHub commit created with correct file structure
- [ ] Schedule set to appropriate time (not during meetings)
- [ ] Error notifications configured (Slack, email, etc.)
- [ ] Backup process for minutes (in case GitHub fails)
- [ ] Monthly API key rotation scheduled
- [ ] Team trained on reading/using meeting minutes

---

## Support & Issues

### Common Questions

**Q: Can I process multiple meetings?**
A: Currently processes the latest meeting. Modify `fetchFirefliesTranscript()` to loop through meetings.

**Q: How long does a routine take to execute?**
A: Typically 20-30 seconds per meeting, including all API calls and email delivery.

**Q: What if a meeting has no action items?**
A: Action items section will show "No action items" - the routine continues normally.

**Q: Can I send to multiple recipients?**
A: Yes. Add a `CC_EMAILS` environment variable and modify Resend API call.

### Reporting Issues

If you encounter problems:

1. **Check execution logs**: Visit `claude.ai/code/routines` → View routine execution history
2. **Review error messages**: Most errors include API response details
3. **Test manually**: Run `node routine.js` locally to isolate the issue
4. **Verify credentials**: Double-check all API keys and permissions

---

## Version History

**v1.0.0** (April 2025)
- Initial release
- Support for Fireflies → GitHub → Email workflow
- Structured JSON output format
- Professional HTML email templates
- Error handling and logging

---

## License

MIT License - See LICENSE file for details

**Author**: Jose Cedeno  
**Contact**: jose@company.com  
**Last Updated**: April 2025
