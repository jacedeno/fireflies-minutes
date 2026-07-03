#!/usr/bin/env node

import crypto from "crypto";

// ==== Environment Validation ====
function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const FIREFLIES_API_KEY = getEnv("FIREFLIES_API_KEY");
const GITHUB_TOKEN = getEnv("GITHUB_TOKEN");
const GITHUB_OWNER = getEnv("GITHUB_OWNER");
const GITHUB_REPO = getEnv("GITHUB_REPO");
const TRILIUM_BASE_URL = getEnv("TRILIUM_BASE_URL");
const TRILIUM_ETAPI_TOKEN = getEnv("TRILIUM_ETAPI_TOKEN");
const TRILIUM_PARENT_NOTE_ID = getEnv("TRILIUM_PARENT_NOTE_ID");
const RESEND_API_KEY = getEnv("RESEND_API_KEY");
const RESEND_FROM_EMAIL = getEnv("RESEND_FROM_EMAIL");
const MEETING_RECIPIENT_EMAIL = getEnv("MEETING_RECIPIENT_EMAIL");
const WORKER_BASE_URL = getEnv("WORKER_BASE_URL");
const WORKER_ADMIN_TOKEN = getEnv("WORKER_ADMIN_TOKEN");

// ==== Helper Functions ====
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toISOString().split("T")[0];
}

function formatDateTime(isoDate) {
  return new Date(isoDate).toISOString();
}

function mmssFromSeconds(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ==== Fireflies API ====
async function fetchTranscript(meetingId) {
  const query = `query Transcript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      duration
      speakers {
        name
        email
      }
      summary {
        overview
        action_items
        keywords
      }
      sentences {
        text
        speaker_name
        start_time
      }
    }
  }`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch("https://api.fireflies.ai/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIREFLIES_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { id: meetingId },
        }),
      });

      if (!response.ok) {
        console.error(
          `Fireflies API error (${response.status}): ${await response.text()}`
        );
        if (attempt < 3) {
          await sleep(20000);
          continue;
        }
        return null;
      }

      const data = await response.json();
      if (data.errors) {
        console.error(`Fireflies GraphQL error: ${JSON.stringify(data.errors)}`);
        if (attempt < 3) {
          await sleep(20000);
          continue;
        }
        return null;
      }

      if (!data.data?.transcript) {
        if (attempt < 3) {
          await sleep(20000);
          continue;
        }
        console.log(`transcript not ready after retries, meetingId=${meetingId}`);
        return null;
      }

      return data.data.transcript;
    } catch (error) {
      console.error(`Fireflies fetch attempt ${attempt} failed: ${error.message}`);
      if (attempt < 3) {
        await sleep(20000);
        continue;
      }
      return null;
    }
  }

  return null;
}

// ==== Minutes Generation ====
function generateMinutesJSON(transcript) {
  const date = new Date(transcript.date);
  const isoDate = date.toISOString().split("T")[0];
  const firefliesUrl = `https://app.fireflies.ai/view/${transcript.id}`;

  const attendees = [
    ...new Set(
      [
        ...transcript.speakers.map((s) => s.name),
        ...transcript.sentences.map((s) => s.speaker_name).filter(Boolean),
      ].filter(Boolean)
    ),
  ];

  // Extract decisions and action items from transcript
  const decisions = [];
  const actionItems = [];
  let decisionCount = 0;
  let taskCount = 0;

  // Parse sentences for decisions and action items
  const sentencesByTime = {};
  transcript.sentences.forEach((s) => {
    if (s.start_time !== null) {
      sentencesByTime[s.start_time] = s.text;
    }
  });

  // Simple heuristic: look for decision/action keywords
  transcript.sentences.forEach((sentence) => {
    const text = sentence.text.toLowerCase();

    if (
      text.includes("decided") ||
      text.includes("decision") ||
      text.includes("we'll go") ||
      text.includes("agreed")
    ) {
      if (decisionCount < 10) {
        decisionCount++;
        const context = sentence.text.substring(0, 100);
        const timestamp =
          sentence.start_time !== null
            ? mmssFromSeconds(sentence.start_time)
            : "00:00";

        decisions.push({
          id: `DEC-${decisionCount.toString().padStart(3, "0")}`,
          decision_text: context,
          owner: sentence.speaker_name || "Unknown",
          priority: "medium",
          timestamp,
          context: context.substring(0, 50),
        });
      }
    }

    if (
      text.includes("task") ||
      text.includes("action item") ||
      text.includes("need to") ||
      text.includes("should")
    ) {
      if (taskCount < 10) {
        taskCount++;
        actionItems.push({
          id: `TASK-${taskCount.toString().padStart(3, "0")}`,
          task: sentence.text.substring(0, 100),
          assigned_to: sentence.speaker_name || "Unknown",
          due_date: "TBD",
          priority: "medium",
          acceptance_criteria: "Completion as discussed in meeting",
        });
      }
    }
  });

  const executiveSummary =
    transcript.summary?.overview ||
    "Meeting conducted and discussed key topics. Action items assigned.";
  const technicalSummary =
    transcript.summary?.overview ||
    "Technical discussions held. Key decisions and action items recorded.";
  const keywords = transcript.summary?.keywords || [];

  return {
    metadata: {
      meeting_date: isoDate,
      meeting_title: transcript.title,
      meeting_duration_minutes: Math.floor(transcript.duration / 60),
      attendees,
      fireflies_meeting_id: transcript.id,
      fireflies_transcript_url: firefliesUrl,
    },
    decisions,
    action_items: actionItems,
    executive_summary: executiveSummary,
    technical_summary: technicalSummary,
    key_topics: keywords,
    follow_ups_needed: [],
    generated_at: formatDateTime(new Date().toISOString()),
    claude_routine_version: "2.0",
  };
}

// ==== Markdown Rendering ====
function renderMarkdown(minutesJSON) {
  const { metadata, decisions, action_items, executive_summary, technical_summary, key_topics, follow_ups_needed, generated_at } =
    minutesJSON;

  let md = `# ${metadata.meeting_title}\n\n`;

  md += `**Date:** ${metadata.meeting_date}\n`;
  md += `**Duration:** ${metadata.meeting_duration_minutes} minutes\n`;
  md += `**Attendees:** ${metadata.attendees.join(", ")}\n`;
  md += `**Meeting ID:** ${metadata.fireflies_meeting_id}\n`;
  md += `**Recording:** [Fireflies Transcript](${metadata.fireflies_transcript_url})\n\n`;

  md += `## Executive Summary\n${executive_summary}\n\n`;

  md += `## Technical Summary\n${technical_summary}\n\n`;

  if (decisions.length > 0) {
    md += `## Decisions\n\n`;
    decisions.forEach((d) => {
      const icon =
        d.priority === "high" ? "🔴" : d.priority === "medium" ? "🟡" : "🟢";
      md += `### ${d.id}: ${d.decision_text} ${icon}\n`;
      md += `- **Owner:** ${d.owner}\n`;
      md += `- **Time:** ${d.timestamp}\n`;
      md += `- **Context:** ${d.context}\n\n`;
    });
  }

  if (action_items.length > 0) {
    md += `## Action Items\n\n`;
    action_items.forEach((t) => {
      const icon =
        t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟡" : "🟢";
      md += `### ${t.id}: ${t.task} ${icon}\n`;
      md += `- **Assigned to:** ${t.assigned_to}\n`;
      md += `- **Due Date:** ${t.due_date}\n`;
      md += `- **Acceptance Criteria:** ${t.acceptance_criteria}\n\n`;
    });
  }

  if (key_topics.length > 0) {
    md += `## Key Topics\n\n`;
    key_topics.forEach((topic) => {
      md += `- ${topic}\n`;
    });
    md += "\n";
  }

  if (follow_ups_needed.length > 0) {
    md += `## Follow-ups Needed\n\n`;
    follow_ups_needed.forEach((followup) => {
      md += `- ${followup}\n`;
    });
    md += "\n";
  }

  md += `---\n\n`;
  md += `*Generated at ${generated_at}*\n`;
  md += `*View full recording: [Fireflies](${metadata.fireflies_transcript_url})*\n`;

  return md;
}

// ==== HTML Email Rendering ====
function renderHTML(markdown, minutesJSON) {
  const { metadata } = minutesJSON;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${metadata.meeting_title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 640px; margin: 0 auto; padding: 20px; }
    h1 { color: #1e40af; margin-bottom: 10px; }
    h2 { color: #3b82f6; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 24px; }
    .metadata { background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }
    .metadata-item { margin: 6px 0; }
    .metadata-label { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background-color: #3b82f6; color: white; padding: 12px; text-align: left; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    tr:hover { background-color: #f9fafb; }
    .priority-high { color: #dc2626; font-weight: 600; }
    .priority-medium { color: #d97706; font-weight: 600; }
    .priority-low { color: #16a34a; font-weight: 600; }
    a { color: #3b82f6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${metadata.meeting_title}</h1>

    <div class="metadata">
      <div class="metadata-item"><span class="metadata-label">Date:</span> ${metadata.meeting_date}</div>
      <div class="metadata-item"><span class="metadata-label">Duration:</span> ${metadata.meeting_duration_minutes} minutes</div>
      <div class="metadata-item"><span class="metadata-label">Attendees:</span> ${metadata.attendees.join(", ")}</div>
      <div class="metadata-item"><span class="metadata-label">Meeting ID:</span> ${metadata.fireflies_meeting_id}</div>
      <div class="metadata-item"><a href="${metadata.fireflies_transcript_url}">View on Fireflies</a></div>
    </div>

    ${markdown
      .split("\n")
      .map((line) => {
        if (line.startsWith("# ")) return `<h1>${line.substring(2)}</h1>`;
        if (line.startsWith("## ")) return `<h2>${line.substring(3)}</h2>`;
        if (line.startsWith("### ")) return `<h3>${line.substring(4)}</h3>`;
        if (line.startsWith("- ")) return `<li>${line.substring(2)}</li>`;
        if (line.startsWith("*Generated at "))
          return `<div class="footer">${line.substring(1)}</div>`;
        if (line.startsWith("*View full "))
          return `<div class="footer">${line.substring(1)}</div>`;
        if (line === "---") return "";
        if (line === "") return "<br>";
        return `<p>${line}</p>`;
      })
      .join("\n")}

    <div class="footer">
      <p>This email was automatically generated by the Fireflies meeting minutes routine.</p>
    </div>
  </div>
</body>
</html>`;
  return html;
}

// ==== GitHub API ====
async function putGitHub(path, content, isJson = false) {
  // Check if file exists and get SHA
  let sha = undefined;
  try {
    const getResp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (getResp.ok) {
      const data = await getResp.json();
      sha = data.sha;
    }
  } catch (e) {
    // File doesn't exist, that's fine
  }

  const b64Content = Buffer.from(content).toString("base64");
  const title = path.split("/").pop().replace(/\.(json|md)$/, "");

  const putResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `chore: add minutes for "${title}" (${path.split("/")[1]}-${path.split("/")[2]}-${path.split("/")[3].split("-").slice(0, 2).join("-")})`,
        content: b64Content,
        ...(sha && { sha }),
        branch: "main",
      }),
    }
  );

  if (!putResp.ok) {
    const err = await putResp.text();
    throw new Error(`GitHub PUT failed (${putResp.status}): ${err}`);
  }

  return putResp.json();
}

// ==== Trilium API ====
async function createTriliumNote(meetingId, minutesJSON, htmlContent) {
  const { metadata } = minutesJSON;
  const title = `${metadata.meeting_title} — ${metadata.meeting_date}`;

  const resp = await fetch(`${TRILIUM_BASE_URL}/etapi/create-note`, {
    method: "POST",
    headers: {
      Authorization: TRILIUM_ETAPI_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parentNoteId: TRILIUM_PARENT_NOTE_ID,
      title,
      type: "text",
      content: htmlContent,
      noteId: `fireflies-${meetingId}`,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Trilium error (${resp.status}): ${err}`);
    return false;
  }

  return true;
}

// ==== Resend Email ====
async function sendResendEmail(minutesJSON, htmlContent) {
  const { metadata } = minutesJSON;
  const subject = `Meeting Minutes: ${metadata.meeting_title} — ${metadata.meeting_date}`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [MEETING_RECIPIENT_EMAIL],
      subject,
      html: htmlContent,
      tags: [{ name: "category", value: "meeting-minutes" }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend failed (${resp.status}): ${err}`);
  }

  return resp.json();
}

// ==== Queue Management ====
async function drainQueue() {
  const resp = await fetch(`${WORKER_BASE_URL}/queue`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${WORKER_ADMIN_TOKEN}`,
    },
  });

  if (!resp.ok) {
    console.error(
      `Queue drain failed (${resp.status}): ${await resp.text()}`
    );
    process.exit(1);
  }

  const data = await resp.json();
  return data.pending || [];
}

async function deleteQueueEntry(meetingId) {
  const resp = await fetch(`${WORKER_BASE_URL}/queue/${meetingId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${WORKER_ADMIN_TOKEN}`,
    },
  });

  if (!resp.ok) {
    console.error(
      `Queue delete failed (${resp.status}): ${await resp.text()}`
    );
    return false;
  }

  return true;
}

// ==== Main Routine ====
async function processMeeting(meetingId, deleteFromQueue = false) {
  console.log(`Processing meetingId=${meetingId}`);

  // Fetch transcript
  const transcript = await fetchTranscript(meetingId);
  if (!transcript) {
    return { success: false, error: "transcript not available" };
  }

  // Generate JSON
  const minutesJSON = generateMinutesJSON(transcript);

  // Render formats
  const markdown = renderMarkdown(minutesJSON);
  const html = renderHTML(markdown, minutesJSON);

  // Determine file path
  const date = minutesJSON.metadata.meeting_date; // YYYY-MM-DD
  const [year, month, day] = date.split("-");
  const slug = slugify(minutesJSON.metadata.meeting_title);
  const jsonPath = `minutes/${year}/${month}/${date}-${slug}.json`;
  const mdPath = `minutes/${year}/${month}/${date}-${slug}.md`;

  try {
    // Commit to GitHub
    await putGitHub(jsonPath, JSON.stringify(minutesJSON, null, 2), true);
    await putGitHub(mdPath, markdown);

    // Create Trilium note
    await createTriliumNote(meetingId, minutesJSON, html);

    // Send email
    await sendResendEmail(minutesJSON, html);

    // Delete from queue if requested
    if (deleteFromQueue) {
      await deleteQueueEntry(meetingId);
    }

    return { success: true };
  } catch (error) {
    console.error(`Processing failed for ${meetingId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  // Check if trigger text contains a meetingId (original trigger mechanism)
  const triggerText = (process.argv[2] || "").trim();

  if (triggerText) {
    // Process single meeting from trigger text
    const result = await processMeeting(triggerText, false);
    if (result.success) {
      console.log(`processed=1 meetingId=${triggerText}`);
      process.exit(0);
    } else {
      console.log(`processed=0 meetingId=${triggerText}`);
      process.exit(1);
    }
  }

  // Otherwise, drain queue (new queue mechanism)
  const queue = await drainQueue();

  if (queue.length === 0) {
    console.log("queue empty, nothing to do");
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;

  for (const entry of queue) {
    const meetingId = entry.meetingId || entry.meeting_id || entry.id;
    if (!meetingId) {
      console.error(`Invalid queue entry, missing meetingId: ${JSON.stringify(entry)}`);
      failed++;
      continue;
    }

    const result = await processMeeting(meetingId, true);
    if (result.success) {
      processed++;
    } else {
      console.error(`Failed to process ${meetingId}: ${result.error}`);
      failed++;
    }
  }

  console.log(`processed=${processed} skipped=0 failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
