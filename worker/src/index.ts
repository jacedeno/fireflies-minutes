export interface Env {
  QUEUE: KVNamespace;
  FIREFLIES_WEBHOOK_SECRET: string;
  WORKER_ADMIN_TOKEN: string;
}

const KV_PREFIX = "pending:";
const KV_TTL_SECONDS = 86400;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/") {
      return handleWebhook(req, env);
    }
    if (req.method === "GET" && url.pathname === "/queue") {
      return handleListQueue(req, env);
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/queue/")) {
      const id = decodeURIComponent(url.pathname.slice("/queue/".length));
      return handleDeleteQueue(id, req, env);
    }
    return new Response("not found", { status: 404 });
  },
};

async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  const signature =
    req.headers.get("x-hub-signature") ??
    req.headers.get("x-hub-signature-256") ??
    req.headers.get("x-fireflies-signature");

  if (!signature) {
    return new Response("missing signature", { status: 401 });
  }
  const valid = await verifyHmac(body, signature, env.FIREFLIES_WEBHOOK_SECRET);
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

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

  const entry = JSON.stringify({
    receivedAt: new Date().toISOString(),
    raw: payload,
  });
  await env.QUEUE.put(KV_PREFIX + meetingId, entry, {
    expirationTtl: KV_TTL_SECONDS,
  });

  return new Response("queued", { status: 200 });
}

async function handleListQueue(req: Request, env: Env): Promise<Response> {
  if (!authorized(req, env)) return unauthorized();

  const list = await env.QUEUE.list({ prefix: KV_PREFIX });
  const pending = await Promise.all(
    list.keys.map(async (k) => {
      const value = await env.QUEUE.get(k.name);
      const meta = value ? (JSON.parse(value) as { receivedAt?: string }) : {};
      return {
        id: k.name.slice(KV_PREFIX.length),
        receivedAt: meta.receivedAt ?? null,
      };
    })
  );
  return Response.json({ pending });
}

async function handleDeleteQueue(
  id: string,
  req: Request,
  env: Env
): Promise<Response> {
  if (!authorized(req, env)) return unauthorized();
  if (!id) return new Response("missing id", { status: 400 });
  await env.QUEUE.delete(KV_PREFIX + id);
  return new Response("deleted", { status: 200 });
}

function pickMeetingId(payload: Record<string, unknown>): string | null {
  const candidates = [
    "meetingId",
    "meeting_id",
    "transcriptId",
    "transcript_id",
    "id",
  ];
  for (const key of candidates) {
    const v = payload[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function authorized(req: Request, env: Env): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  return timingSafeEqual(auth, `Bearer ${env.WORKER_ADMIN_TOKEN}`);
}

function unauthorized(): Response {
  return new Response("unauthorized", { status: 401 });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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
  const computed = bufferToHex(sig);
  return timingSafeEqual(provided.toLowerCase(), computed.toLowerCase());
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
