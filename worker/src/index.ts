export interface Env {
  FIREFLIES_WEBHOOK_SECRET: string;
  ANTHROPIC_ROUTINE_URL: string;
  ANTHROPIC_ROUTINE_TOKEN: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/") {
      return new Response("not found", { status: 404 });
    }

    const body = await req.text();

    // Verify Fireflies HMAC signature
    const signature =
      req.headers.get("x-hub-signature") ??
      req.headers.get("x-hub-signature-256") ??
      req.headers.get("x-fireflies-signature");

    if (!signature) {
      return new Response("missing signature", { status: 401 });
    }
    if (!(await verifyHmac(body, signature, env.FIREFLIES_WEBHOOK_SECRET))) {
      return new Response("invalid signature", { status: 401 });
    }

    // Extract meetingId from the Fireflies payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const meetingId = pickMeetingId(payload);
    if (!meetingId) {
      return new Response("missing meetingId", { status: 400 });
    }

    // Forward to Claude Code Remote Trigger
    const triggerResp = await fetch(env.ANTHROPIC_ROUTINE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ANTHROPIC_ROUTINE_TOKEN}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
      },
      body: JSON.stringify({ text: meetingId }),
    });

    if (!triggerResp.ok) {
      const err = await triggerResp.text();
      console.error(`trigger failed (${triggerResp.status}): ${err}`);
      return new Response("trigger failed", { status: 502 });
    }

    return new Response("triggered", { status: 200 });
  },
};

function pickMeetingId(payload: Record<string, unknown>): string | null {
  for (const key of ["meetingId", "meeting_id", "transcriptId", "transcript_id", "id"]) {
    const v = payload[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

async function verifyHmac(
  body: string,
  header: string,
  secret: string
): Promise<boolean> {
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );
  const computed = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (provided.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ computed.charCodeAt(i);
  }
  return diff === 0;
}
