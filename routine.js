#!/usr/bin/env node

/**
 * Fireflies Meeting Minutes Routine
 * 
 * Processes Fireflies meeting transcriptions and generates structured minutes
 * with decisions, action items, and executive summary.
 * 
 * Sends report via Resend email API.
 * 
 * Environment Variables Required:
 *   - FIREFLIES_API_KEY: Fireflies API authentication
 *   - RESEND_API_KEY: Resend email API key
 *   - RESEND_FROM_EMAIL: Email sender address
 *   - GITHUB_TOKEN: GitHub authentication for commits
 *   - MEETING_RECIPIENT_EMAIL: Primary recipient for meeting minutes
 */

import fetch from 'node-fetch';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Fetch latest meeting transcript from Fireflies API
 */
async function fetchFirefliesTranscript() {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    throw new Error('FIREFLIES_API_KEY environment variable not set');
  }

  try {
    console.log('[FIREFLIES] Fetching latest meeting transcript...');
    
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `
          query {
            transcripts(limit: 1, sort: {field: "date", order: "DESC"}) {
              id
              title
              date
              duration
              speakers {
                name
                email
              }
              transcript
              summary
              action_items {
                text
                owner
              }
            }
          }
        `,
      }),
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Fireflies API error: ${JSON.stringify(data.errors)}`);
    }

    const transcript = data.data?.transcripts?.[0];
    if (!transcript) {
      throw new Error('No transcripts found in Fireflies');
    }

    console.log(`[FIREFLIES] Retrieved: "${transcript.title}" (${transcript.duration} min)`);
    return transcript;
  } catch (error) {
    console.error('[ERROR] Failed to fetch Fireflies transcript:', error.message);
    throw error;
  }
}

/**
 * Parse transcript and extract decisions and action items
 * This is where Claude (via the routine) would apply reasoning
 */
function parseTranscript(transcript) {
  console.log('[PARSER] Analyzing transcript for decisions and action items...');

  // Placeholder structure - Claude routine will enhance this with actual analysis
  const parsed = {
    metadata: {
      meeting_date: new Date(transcript.date).toISOString(),
      meeting_title: transcript.title,
      meeting_duration_minutes: transcript.duration,
      attendees: transcript.speakers?.map(s => s.name) || [],
      fireflies_meeting_id: transcript.id,
      fireflies_transcript_url: `https://app.fireflies.ai/transcript/${transcript.id}`,
    },
    decisions: [],
    action_items: [],
    technical_summary: transcript.summary || 'Summary pending analysis',
    executive_summary: 'Executive summary pending detailed analysis',
    key_topics: [],
    follow_ups_needed: [],
    generated_at: new Date().toISOString(),
    claude_routine_version: '1.0',
  };

  // Extract action items from Fireflies AI-generated items
  if (transcript.action_items && Array.isArray(transcript.action_items)) {
    parsed.action_items = transcript.action_items.map((item, idx) => ({
      id: `TASK-${String(idx + 1).padStart(3, '0')}`,
      task: item.text,
      assigned_to: item.owner || 'Unassigned',
      due_date: 'TBD',
      priority: 'medium',
      acceptance_criteria: 'Completion confirmed by assignee',
    }));
  }

  console.log(`[PARSER] Extracted ${parsed.action_items.length} action items`);
  return parsed;
}

/**
 * Generate plain text email report for meeting minutes
 * 
 * Format: Markdown-style plain text
 * - Easy to copy/paste in any email client
 * - Easy to forward to stakeholders
 * - Readable on mobile and desktop
 * - Perfect for archival and documentation
 * - Can be pasted into Slack, Teams, or any messaging platform
 */
function generateTextReport(minutesData) {
  const { metadata, decisions, action_items, executive_summary, technical_summary, key_topics, follow_ups_needed } = minutesData;

  const meetingDate = new Date(metadata.meeting_date);
  const formattedDate = meetingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = meetingDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Format decisions section
  const decisionsText = decisions.length > 0
    ? decisions
        .map(
          (dec) =>
            `  [${dec.id}] ${dec.decision_text}\n` +
            `      Owner: ${dec.owner} | Priority: ${dec.priority.toUpperCase()} | Time: ${dec.timestamp || 'N/A'}\n` +
            `      Context: ${dec.context || 'No additional context'}`
        )
        .join('\n\n')
    : '  (No decisions recorded)';

  // Format action items section
  const actionItemsText = action_items.length > 0
    ? action_items
        .map((item) => {
          // Add priority indicator
          const priorityMarker = item.priority === 'high' ? '[HIGH]' : item.priority === 'medium' ? '[MED]' : '[LOW]';
          return (
            `  ${priorityMarker} [${item.id}] ${item.task}\n` +
            `           Assigned to: ${item.assigned_to}\n` +
            `           Due date: ${item.due_date}\n` +
            `           Criteria: ${item.acceptance_criteria || 'TBD'}`
          );
        })
        .join('\n\n')
    : '  (No action items)';

  // Format key topics
  const topicsText = key_topics && key_topics.length > 0
    ? key_topics.map(t => `  • ${t}`).join('\n')
    : '  (None recorded)';

  // Format follow-ups
  const followUpsText = follow_ups_needed && follow_ups_needed.length > 0
    ? follow_ups_needed.map(f => `  • ${f}`).join('\n')
    : '  (None recorded)';

  // Build the complete report in plain text
  const report = `
╔═══════════════════════════════════════════════════════════════════╗
║                    MEETING MINUTES REPORT                         ║
╚═══════════════════════════════════════════════════════════════════╝

MEETING DETAILS
─────────────────────────────────────────────────────────────────────
Title:        ${metadata.meeting_title}
Date:         ${formattedDate} at ${formattedTime}
Duration:     ${metadata.meeting_duration_minutes} minutes
Attendees:    ${metadata.attendees.join(', ')}
Meeting ID:   ${metadata.fireflies_meeting_id}

Full Transcript:
${metadata.fireflies_transcript_url}


EXECUTIVE SUMMARY
─────────────────────────────────────────────────────────────────────
${executive_summary}


TECHNICAL DISCUSSION
─────────────────────────────────────────────────────────────────────
${technical_summary}


DECISIONS MADE
─────────────────────────────────────────────────────────────────────
${decisionsText}


ACTION ITEMS
─────────────────────────────────────────────────────────────────────
Priority Legend: [HIGH] = High Priority | [MED] = Medium Priority | [LOW] = Low Priority

${actionItemsText}


KEY TOPICS DISCUSSED
─────────────────────────────────────────────────────────────────────
${topicsText}


FOLLOW-UP ITEMS NEEDED
─────────────────────────────────────────────────────────────────────
${followUpsText}


═══════════════════════════════════════════════════════════════════════

HOW TO USE THIS REPORT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Copy entire content and paste into email
✓ Forward directly to stakeholders
✓ Share via Slack/Teams - paste directly in message
✓ Save as .txt file for permanent archival
✓ Convert to PDF using your email client
✓ Add to project documentation/wiki

Generated by: Claude Code Routine
Generated at: ${new Date().toLocaleString()}
═══════════════════════════════════════════════════════════════════════
`;

  return report.trim();
}

/**
 * Convert JSON minutes data to Markdown format
 * Used for GitHub .md files and Trilium display
 */
function convertToMarkdown(minutesData) {
  const { metadata, decisions, action_items, executive_summary, technical_summary, key_topics, follow_ups_needed } = minutesData;

  const meetingDate = new Date(metadata.meeting_date);
  const formattedDate = meetingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = meetingDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Format decisions
  const decisionsMarkdown = decisions.length > 0
    ? decisions
        .map(
          (dec) =>
            `#### ${dec.id}: ${dec.decision_text}\n\n` +
            `- **Owner**: ${dec.owner}\n` +
            `- **Priority**: ${dec.priority.toUpperCase()}\n` +
            `- **Timestamp**: ${dec.timestamp || 'N/A'}\n` +
            `- **Context**: ${dec.context || 'No additional context'}`
        )
        .join('\n\n')
    : '_No decisions recorded._'

  // Format action items
  const actionItemsMarkdown = action_items.length > 0
    ? action_items
        .map((item) => {
          const priorityBadge = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
          return (
            `#### ${priorityBadge} ${item.id}: ${item.task}\n\n` +
            `- **Assigned to**: ${item.assigned_to}\n` +
            `- **Due date**: ${item.due_date}\n` +
            `- **Acceptance criteria**: ${item.acceptance_criteria || 'TBD'}`
          );
        })
        .join('\n\n')
    : '_No action items._'

  // Format topics
  const topicsMarkdown = key_topics && key_topics.length > 0
    ? key_topics.map(t => `- ${t}`).join('\n')
    : '_None recorded._'

  // Format follow-ups
  const followUpsMarkdown = follow_ups_needed && follow_ups_needed.length > 0
    ? follow_ups_needed.map(f => `- ${f}`).join('\n')
    : '_None recorded._'

  const markdown = `# ${metadata.meeting_title}

**Date**: ${formattedDate} at ${formattedTime}  
**Duration**: ${metadata.meeting_duration_minutes} minutes  
**Attendees**: ${metadata.attendees.join(', ')}  
**Meeting ID**: ${metadata.fireflies_meeting_id}  

[View Full Transcript on Fireflies](${metadata.fireflies_transcript_url})

---

## Executive Summary

${executive_summary}

---

## Technical Discussion

${technical_summary}

---

## Decisions Made

${decisionsMarkdown}

---

## Action Items

**Priority Legend**: 🔴 = High Priority | 🟡 = Medium Priority | 🟢 = Low Priority

${actionItemsMarkdown}

---

## Key Topics Discussed

${topicsMarkdown}

---

## Follow-Up Items Needed

${followUpsMarkdown}

---

**Generated by**: Claude Code Routine  
**Generated at**: ${new Date().toLocaleString()}  
**Meeting ID**: ${metadata.fireflies_meeting_id}
`;

  return markdown.trim();
}

/**
 * Save meeting minutes to GitHub repository
 * Saves both JSON (data) and Markdown (human-readable) versions
 */
async function saveToGitHub(minutesData) {
  const githubToken = process.env.GITHUB_TOKEN;
  const repoOwner = process.env.GITHUB_OWNER || 'your-github-username'; // Replace with actual
  const repoName = process.env.GITHUB_REPO || 'fireflies-minutas'; // Replace with actual
  
  if (!githubToken) {
    console.warn('[GITHUB] GITHUB_TOKEN not set - skipping GitHub save');
    return;
  }

  try {
    console.log('[GITHUB] Saving meeting minutes to repository...');

    // Create file paths: minutes/YYYY/MM/YYYY-MM-DD-slug.*
    const date = new Date(minutesData.metadata.meeting_date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const slug = minutesData.metadata.meeting_title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const basePath = `minutes/${year}/${month}/${year}-${month}-${day}-${slug}`;
    const jsonFilePath = `${basePath}.json`;
    const mdFilePath = `${basePath}.md`;

    const filesData = [
      // JSON file - structured data
      {
        path: jsonFilePath,
        content: JSON.stringify(minutesData, null, 2),
        description: 'JSON structured data',
      },
      // Markdown file - human readable
      {
        path: mdFilePath,
        content: convertToMarkdown(minutesData),
        description: 'Markdown formatted',
      },
    ];

    // Save both files
    for (const fileData of filesData) {
      const base64Content = Buffer.from(fileData.content).toString('base64');

      // Get SHA of existing file (if it exists)
      let sha = null;
      try {
        const getResponse = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${fileData.path}`,
          {
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        );
        if (getResponse.ok) {
          const existingFile = await getResponse.json();
          sha = existingFile.sha;
        }
      } catch (e) {
        // File doesn't exist yet, that's fine
      }

      // Create/update file
      const response = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${fileData.path}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `chore: add meeting minutes for "${minutesData.metadata.meeting_title}" (${minutesData.metadata.meeting_date.split('T')[0]})`,
            content: base64Content,
            branch: 'main',
            ...(sha && { sha }),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      console.log(`[GITHUB] Saved (${fileData.description}): ${fileData.path}`);
    }

    return { jsonPath: jsonFilePath, mdPath: mdFilePath };
  } catch (error) {
    console.error('[ERROR] Failed to save to GitHub:', error.message);
    throw error;
  }
}

/**
 * Send meeting minutes via Resend email API
 * 
 * Sends plain text email report (not HTML) so it's easy to:
 * - Copy/paste directly
 * - Forward to stakeholders
 * - Share in Slack/Teams
 * - Archive as plain text
 */
async function sendEmailReport(minutesData, textContent, filePath) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.MEETING_RECIPIENT_EMAIL;

  if (!resendApiKey || !fromEmail || !toEmail) {
    console.warn('[RESEND] Missing email configuration - skipping email send');
    return;
  }

  try {
    console.log('[RESEND] Sending email report...');

    const subject = `Meeting Minutes: ${minutesData.metadata.meeting_title} - ${new Date(minutesData.metadata.meeting_date).toLocaleDateString()}`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        cc: minutesData.metadata.attendees
          .map((name) => {
            // Optional: lookup email from MEETING_ATTENDEES_JSON env var
            return null;
          })
          .filter(Boolean),
        subject: subject,
        // Send as plain text (not HTML) for easy copy/paste
        text: textContent,
        tags: ['meeting-minutes', 'maintenance'],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Resend API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    console.log(`[RESEND] Email sent successfully (ID: ${result.id})`);
    return result.id;
  } catch (error) {
    console.error('[ERROR] Failed to send email:', error.message);
    throw error;
  }
}

/**
 * Main routine execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Meeting Minutes Processing Routine - Starting Execution');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Fetch transcript
    const transcript = await fetchFirefliesTranscript();

    // Step 2: Parse and analyze
    const minutesData = parseTranscript(transcript);

    // Step 3: Generate plain text report (easy to copy/paste/forward)
    const textReport = generateTextReport(minutesData);

    // Step 4: Save to GitHub
    const githubPath = await saveToGitHub(minutesData);

    // Step 5: Send email
    const emailId = await sendEmailReport(minutesData, textReport, githubPath);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ Routine Completed Successfully');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nSummary:\n`);
    console.log(`  Meeting: ${minutesData.metadata.meeting_title}`);
    console.log(`  Date: ${new Date(minutesData.metadata.meeting_date).toLocaleDateString()}`);
    console.log(`  Action Items: ${minutesData.action_items.length}`);
    console.log(`  Decisions: ${minutesData.decisions.length}`);
    console.log(`  GitHub: ✅ (JSON + Markdown)`);
    console.log(`    → ${githubPath.jsonPath}`);
    console.log(`    → ${githubPath.mdPath}`);
    console.log(`  Email: ✅ (${emailId || 'Sent'})`);
    console.log('');
  } catch (error) {
    console.error('\n═══════════════════════════════════════════════════════════════');
    console.error('  ❌ Routine Failed');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// Execute routine
main();
