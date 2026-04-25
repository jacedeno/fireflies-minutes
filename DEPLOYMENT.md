# Deployment Guide: Fireflies Meeting Minutes Routine

## Complete Setup Instructions

This guide walks you through deploying the Claude Code Routine to GitHub and configuring it to run automatically.

**Estimated Time**: 15-20 minutes  
**Difficulty**: Intermediate  
**Prerequisites**: GitHub account, CLI knowledge (terminal/bash)

---

## Phase 1: Prepare Your GitHub Repository

### Step 1.1: Create GitHub Repository

```bash
# Option A: Via GitHub Web Interface (Easiest)
# 1. Go to https://github.com/new
# 2. Repository name: fireflies-minutas
# 3. Description: "Claude Code Routine for Fireflies meeting minutes processing"
# 4. Visibility: Private (to protect API keys)
# 5. Add README: ✓ (already provided)
# 6. Add .gitignore: ✓ (Node)
# 7. Click "Create repository"

# Option B: Via GitHub CLI
gh repo create fireflies-minutas \
  --private \
  --source=. \
  --remote=origin \
  --push \
  --description="Claude Code Routine for Fireflies meeting minutes"
```

### Step 1.2: Clone or Push to GitHub

```bash
# If you created repo on GitHub.com (Option A):
cd ~/projects
git clone https://github.com/YOUR-USERNAME/fireflies-minutas.git
cd fireflies-minutas

# Copy the files we created into this directory:
cp /tmp/fireflies-minutas-routine/* ./

# Or if you started locally (Option B):
cd ~/projects/fireflies-minutas
git init
git add .
git commit -m "Initial commit: Fireflies meeting minutes routine"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/fireflies-minutas.git
git push -u origin main
```

### Step 1.3: Configure Repository Secrets (for credentials)

Store your API keys as GitHub Secrets so they're not committed to the repo:

```bash
# Method A: Via GitHub CLI (from terminal)
gh secret set FIREFLIES_API_KEY --body "$(grep FIREFLIES_API_KEY .env | cut -d= -f2-)"
gh secret set RESEND_API_KEY --body "$(grep RESEND_API_KEY .env | cut -d= -f2-)"
gh secret set GITHUB_TOKEN --body "$(grep GITHUB_TOKEN .env | cut -d= -f2-)"

# Method B: Via GitHub Web Interface
# 1. Go to https://github.com/YOUR-USERNAME/fireflies-minutas
# 2. Settings → Secrets and variables → Actions
# 3. Click "New repository secret"
# 4. Add each secret:
#    - Name: FIREFLIES_API_KEY
#      Value: (paste your key)
#    - Name: RESEND_API_KEY
#      Value: (paste your key)
#    - Name: GITHUB_TOKEN
#      Value: (paste your key)
```

---

## Phase 2: Prepare API Credentials

### Step 2.1: Get Fireflies API Key

```bash
# 1. Visit: https://app.fireflies.ai/settings/api
# 2. Click "Create new API key" (if you don't have one)
# 3. Copy the key that starts with 'Bearer'
# 4. Paste into GitHub Secret as shown above
```

### Step 2.2: Get Resend API Key

```bash
# 1. Visit: https://resend.com
# 2. Sign up or log in
# 3. Go to API Keys: https://resend.com/api-keys
# 4. Click "Create API Key"
# 5. Give it a name: "Fireflies Routine"
# 6. Copy the key (starts with 're_')
#
# IMPORTANT: Verify your sending domain first
# 1. Go to Domains: https://resend.com/domains
# 2. Click "Add Domain"
# 3. Enter your domain (e.g., company.com, your-domain.com)
# 4. Add DNS records to your domain registrar
# 5. Click "Verify" once DNS is configured
#
# Use this domain in RESEND_FROM_EMAIL in .env
```

### Step 2.3: Get GitHub Personal Access Token

```bash
# 1. Visit: https://github.com/settings/tokens
# 2. Click "Generate new token" (classic)
# 3. Token name: "Fireflies Routine"
# 4. Expiration: 90 days
# 5. Scopes needed:
#    ✓ repo (full control of repositories)
#      ✓ repo:status
#      ✓ repo_deployment
#      ✓ public_repo
#      ✓ (all sub-items)
# 6. Click "Generate token"
# 7. Copy token immediately (you won't see it again)
# 8. Paste into GitHub Secret as shown above
```

---

## Phase 3: Configure Claude Code Routine

### Step 3.1: Set Up in Claude Code (Web Interface - Recommended)

```
1. Go to: https://claude.ai/code/routines
2. Click "New Routine"
3. Configure the following:

   Repository Selection:
   - Select "fireflies-minutas" from your GitHub repos
   - Branch: main

   Routine Prompt:
   - Copy-paste entire content of CLAUDE.md from the repo
   - This becomes the AI agent's instruction set

   Connectors:
   - Fireflies API (authenticate with FIREFLIES_API_KEY)
   - Resend Email API (authenticate with RESEND_API_KEY)
   - GitHub (authenticate with GITHUB_TOKEN)

   Trigger Configuration:
   - Type: Schedule
   - Frequency: Daily
   - Time: 14:00 (2 PM UTC)
   - Timezone: America/Denver (or your timezone)
   
   Additional Options:
   - Max retries: 2
   - Timeout: 60 seconds
   - Notifications: Email on failure

4. Review all settings
5. Click "Create Routine"
6. Routine will appear in your routines list
```

### Step 3.2: Alternative: Set Up via CLI

```bash
# If you have Claude Code CLI installed on Fedora
cd ~/projects/fireflies-minutas
claude

# Inside Claude Code session, type:
/schedule

# Follow prompts:
# 1. Enter routine name: "fireflies-meeting-minutes"
# 2. Select repository: fireflies-minutas
# 3. Enter schedule (cron): 0 14 * * *
# 4. Paste CLAUDE.md content as the routine prompt
# 5. Configure trigger type: schedule
# 6. Confirm settings
# 7. Type /save to save routine
```

---

## Phase 4: Environment Variables in .env

```bash
# Update your .env file with actual values (do NOT commit this file)

# ============================================
# FIREFLIES CONFIGURATION
# ============================================
FIREFLIES_API_KEY=Bearer_abc123xyz...

# ============================================
# RESEND EMAIL CONFIGURATION
# ============================================
RESEND_API_KEY=re_abc123xyz...
RESEND_FROM_EMAIL=reports@your-verified-domain.com

# ============================================
# GITHUB CONFIGURATION
# ============================================
GITHUB_TOKEN=ghp_abc123xyz...
GITHUB_OWNER=your-github-username
GITHUB_REPO=fireflies-minutas

# ============================================
# MEETING CONFIGURATION
# ============================================
MEETING_RECIPIENT_EMAIL=jose@your-domain.com

# Optional: Map attendee names to email addresses
MEETING_ATTENDEES_JSON={"Jose Cedeno": "jose@your-domain.com"}

# ============================================
# SCHEDULE CONFIGURATION
# ============================================
ROUTINE_SCHEDULE=0 14 * * *
ROUTINE_TIMEZONE=America/Denver
```

---

## Phase 5: Test the Routine

### Step 5.1: Manual Test (Recommended First)

```bash
# Clone the repo locally
cd ~/projects
git clone https://github.com/YOUR-USERNAME/fireflies-minutas.git
cd fireflies-minutas

# Install dependencies
npm install

# Load environment variables
source .env

# Run the routine manually
node routine.js

# Expected output:
# ═══════════════════════════════════════════════════════════════
#   Meeting Minutes Processing Routine - Starting Execution
# ═══════════════════════════════════════════════════════════════
# 
# [FIREFLIES] Fetching latest meeting transcript...
# [FIREFLIES] Retrieved: "Your Meeting Title" (XX min)
# [PARSER] Analyzing transcript...
# [GITHUB] Saving meeting minutes to repository...
# [RESEND] Sending email report...
# 
# ✅ Routine Completed Successfully
```

### Step 5.2: Verify GitHub Commit

```bash
# Check that minutes were saved to the repo
cd ~/projects/fireflies-minutas
git pull

# List files (should see minutes/ directory with new file)
ls -la minutes/2025/04/

# Expected output:
# 2025-04-24-maintenance-meeting.json
```

### Step 5.3: Check Email Delivery

```bash
# Check your email inbox (MEETING_RECIPIENT_EMAIL)
# You should receive:
# - From: RESEND_FROM_EMAIL
# - Subject: "Meeting Minutes: [Title] - [Date]"
# - Content: Professional HTML report with:
#   - Executive summary
#   - Decision list
#   - Action items table
#   - Technical discussion
#   - Link to Fireflies transcript

# If email not received:
# 1. Check spam/junk folder
# 2. Verify domain is authenticated in Resend
# 3. Check Resend dashboard for delivery logs
# 4. Verify MEETING_RECIPIENT_EMAIL is correct
```

---

## Phase 6: Automated Scheduling

### Option A: Claude Code Schedule (Recommended)

Once routine is created in Claude AI, it runs automatically at scheduled time.

```
No additional setup needed!
- Runs on Anthropic's infrastructure
- Works even if your laptop is off
- Check execution history at: https://claude.ai/code/routines
```

### Option B: GitHub Actions (Backup/Alternative)

If you want a backup trigger via GitHub Actions:

Create `.github/workflows/run-routine.yml`:

```yaml
name: Fireflies Meeting Minutes Routine

on:
  schedule:
    # Run daily at 2 PM UTC (8 AM Mountain)
    - cron: '0 14 * * *'
  
  # Also allow manual trigger
  workflow_dispatch:

jobs:
  process-minutes:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run meeting minutes routine
        env:
          FIREFLIES_API_KEY: ${{ secrets.FIREFLIES_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MEETING_RECIPIENT_EMAIL: ${{ secrets.MEETING_RECIPIENT_EMAIL }}
        run: node routine.js
      
      - name: Commit changes if any
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add -A
          git diff-index --quiet HEAD || git commit -m "Auto: meeting minutes processing"
          git push
```

---

## Phase 7: Monitoring & Maintenance

### Weekly Checklist

- [ ] Check execution logs at claude.ai/code/routines
- [ ] Verify emails are being delivered
- [ ] Spot-check generated minutes for accuracy
- [ ] Ensure GitHub commits are being created

### Monthly Maintenance

- [ ] Review and update routine prompt (CLAUDE.md) if needed
- [ ] Rotate GitHub token (for security)
- [ ] Check Resend email delivery statistics
- [ ] Verify Fireflies API quota usage

### Troubleshooting Commands

```bash
# Check recent commits to minutes/
git log --oneline -- minutes/ | head -10

# Verify routine.js syntax
node --check routine.js

# Test Fireflies API connectivity
curl -H "Authorization: Bearer $FIREFLIES_API_KEY" \
  https://api.fireflies.ai/graphql

# View .env without exposing secrets
cat .env | sed 's/=.*/=***/'
```

---

## Rollback Plan (If Something Goes Wrong)

```bash
# If routine starts creating bad data:

# 1. Disable the routine
#    - Go to https://claude.ai/code/routines
#    - Click routine, then "Pause" or "Delete"

# 2. Revert recent commits if needed
git log --oneline -- minutes/ | head -5
git revert <commit-hash>

# 3. Fix the issue in routine.js or CLAUDE.md
nano routine.js

# 4. Commit fix
git add CLAUDE.md routine.js
git commit -m "fix: resolve [issue description]"
git push

# 5. Re-enable routine in Claude Code
```

---

## Summary

You now have a production-ready Claude Code Routine that:

✅ Runs automatically on schedule (no local machine needed)  
✅ Processes Fireflies meetings and generates structured minutes  
✅ Saves minutes to GitHub for version control  
✅ Sends professional email reports via Resend  
✅ Includes complete error handling and logging  
✅ All code, comments, and documentation in English  

**Next Steps**:
1. Create the GitHub repository
2. Configure API credentials
3. Deploy to Claude Code Routine
4. Test with a real meeting
5. Monitor first week of execution

**Questions?** Check README.md or troubleshooting section above.

---

**Version**: 1.0  
**Last Updated**: April 2025  
**Author**: Jose Cedeno  
**Contact**: For setup help, refer to README.md
