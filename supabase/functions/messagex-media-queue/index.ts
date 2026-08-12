const expectedHeartbeatSecretHash = "a578fe2388f12185149f52bcb425eda1b84ca0ef2613e570bf703ff6a80e7d93";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const queueBucket = "messagex-media-queue";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-messagex-heartbeat-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function encodedPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function serviceRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers as Record<string, string> || {}),
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function authorizeLaptop(request: Request): Promise<boolean> {
  const supplied = request.headers.get("x-messagex-heartbeat-secret") || "";
  return constantTimeEqual(await sha256Hex(supplied), expectedHeartbeatSecretHash);
}

async function userFromRequest(request: Request): Promise<{ id: string } | null> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] === serviceRoleKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${match[1]}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? { id: user.id } : null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function rpc(name: string, body: Record<string, unknown>): Promise<{ response: Response; data: unknown }> {
  const response = await serviceRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

async function storageObjectExists(objectPath: string, expectedSize: number): Promise<boolean> {
  const parts = objectPath.split("/");
  const fileName = parts.pop();
  const prefix = parts.join("/");
  const response = await serviceRequest(`/storage/v1/object/list/${queueBucket}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, search: fileName, limit: 10, offset: 0 }),
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.some((row) =>
    row?.name === fileName && Number(row?.metadata?.size) === expectedSize
  );
}

async function handleEnqueue(request: Request, payload: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: "Your MessageX session expired. Sign in again." });

  const queueId = String(payload.queue_id || "").toLowerCase();
  const chatId = String(payload.chat_id || "").toLowerCase();
  const objectPath = String(payload.object_path || "");
  const mediaType = String(payload.media_type || "").toLowerCase();
  const originalName = String(payload.original_name || "upload").slice(0, 180);
  const sha256 = String(payload.sha256 || "").toLowerCase();
  const sizeBytes = Number(payload.size_bytes);
  const sentAt = String(payload.sent_at || "");
  const textValue = typeof payload.text === "string" ? payload.text.slice(0, 10000) : null;
  const replyToId = payload.reply_to_id == null ? null : Number(payload.reply_to_id);
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

  if (!new RegExp(`^${uuid}$`).test(queueId) || !new RegExp(`^${uuid}$`).test(chatId)) {
    return json(400, { error: "Invalid queue or chat identifier." });
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 104857600) {
    return json(400, { error: "Invalid queued media size." });
  }
  if (!/^[0-9a-f]{64}$/.test(sha256) || !/^(image|video|audio)\/[a-z0-9.+-]+$/.test(mediaType)) {
    return json(400, { error: "Invalid queued media type or checksum." });
  }
  if (!Number.isFinite(Date.parse(sentAt))) return json(400, { error: "Invalid sent timestamp." });
  if (replyToId !== null && (!Number.isSafeInteger(replyToId) || replyToId < 1)) {
    return json(400, { error: "Invalid reply reference." });
  }
  const expectedPrefix = `${user.id}/${chatId}/${queueId}/`;
  if (!objectPath.startsWith(expectedPrefix) || !/^[a-zA-Z0-9._-]{1,180}$/.test(objectPath.slice(expectedPrefix.length))) {
    return json(403, { error: "Queued object path does not belong to this session." });
  }
  if (!(await storageObjectExists(objectPath, sizeBytes))) {
    return json(409, { error: "The private queued media object is missing or incomplete." });
  }

  const profileResponse = await serviceRequest(
    `/rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=username,is_banned&limit=1`,
  );
  if (!profileResponse.ok) return json(502, { error: "Could not verify the MessageX sender." });
  const profiles = await profileResponse.json();
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile?.username || profile?.is_banned === true) return json(403, { error: "This account cannot send media." });

  const result = await rpc("messagex_enqueue_media", {
    p_queue_id: queueId,
    p_chat_id: chatId,
    p_sender: profile.username,
    p_sender_user_id: user.id,
    p_object_path: objectPath,
    p_media_type: mediaType,
    p_original_name: originalName,
    p_size_bytes: sizeBytes,
    p_sha256: sha256,
    p_sent_at: sentAt,
    p_text: textValue,
    p_reply_to_id: replyToId,
  });
  if (!result.response.ok) {
    console.error("Queue enqueue RPC failed", result.response.status, result.data);
    return json(result.response.status === 400 ? 400 : 403, { error: "The queued message could not be created." });
  }
  const record = Array.isArray(result.data) ? result.data[0] : result.data;
  return json(201, { ok: true, queued: true, ...record });
}

async function profileForUser(userId: string): Promise<Record<string, unknown> | null> {
  const response = await serviceRequest(
    `/rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(userId)}&select=username,is_banned&limit=1`,
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function handleEnqueueProfile(request: Request, payload: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: "Your MessageX session expired. Sign in again." });
  const profile = await profileForUser(user.id);
  if (!profile?.username || profile?.is_banned === true) return json(403, { error: "This account cannot update a profile photo." });

  const queueId = String(payload.queue_id || "").toLowerCase();
  const objectPath = String(payload.object_path || "");
  const mediaType = String(payload.media_type || "").toLowerCase();
  const originalName = String(payload.original_name || "profile.jpg").slice(0, 180);
  const sha256 = String(payload.sha256 || "").toLowerCase();
  const sizeBytes = Number(payload.size_bytes);
  const sentAt = String(payload.sent_at || "");
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  if (!new RegExp(`^${uuid}$`).test(queueId) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 104857600
      || !/^image\/[a-z0-9.+-]+$/.test(mediaType) || !/^[0-9a-f]{64}$/.test(sha256)
      || !Number.isFinite(Date.parse(sentAt))) {
    return json(400, { error: "Invalid queued profile media." });
  }
  const prefix = `${user.id}/profile/${queueId}/`;
  if (!objectPath.startsWith(prefix) || !/^[a-zA-Z0-9._-]{1,180}$/.test(objectPath.slice(prefix.length))) {
    return json(403, { error: "Queued profile object does not belong to this session." });
  }
  if (!(await storageObjectExists(objectPath, sizeBytes))) {
    return json(409, { error: "The private queued profile object is missing or incomplete." });
  }
  const result = await rpc("messagex_enqueue_profile_media", {
    p_queue_id: queueId,
    p_sender_user_id: user.id,
    p_profile_username: profile.username,
    p_object_path: objectPath,
    p_media_type: mediaType,
    p_original_name: originalName,
    p_size_bytes: sizeBytes,
    p_sha256: sha256,
    p_sent_at: sentAt,
  });
  if (!result.response.ok) {
    console.error("Profile queue enqueue RPC failed", result.response.status, result.data);
    return json(403, { error: "The queued profile photo could not be created." });
  }
  const record = Array.isArray(result.data) ? result.data[0] : result.data;
  return json(201, { ok: true, queued: true, ...record });
}

async function handleSetProfile(request: Request, payload: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: "Your MessageX session expired. Sign in again." });
  const profile = await profileForUser(user.id);
  if (!profile?.username || profile?.is_banned === true) return json(403, { error: "This account cannot update a profile photo." });
  const avatarUrl = String(payload.avatar_url || "");
  const result = await rpc("messagex_set_profile_media", {
    p_sender_user_id: user.id,
    p_profile_username: profile.username,
    p_avatar_url: avatarUrl,
  });
  if (!result.response.ok) {
    console.error("Set profile media RPC failed", result.response.status, result.data);
    return json(403, { error: "The laptop profile photo reference could not be saved." });
  }
  const record = Array.isArray(result.data) ? result.data[0] : result.data;
  return json(200, { ok: true, ...record });
}

async function removeStorageObject(objectPath: string): Promise<boolean> {
  const response = await serviceRequest(`/storage/v1/object/${queueBucket}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
  return response.ok;
}

async function cleanupTransferredOrCancelled(): Promise<void> {
  const response = await serviceRequest(
    "/rest/v1/messagex_media_queue?status=in.(completed,cancelled)&storage_deleted_at=is.null&select=id,object_path&limit=10",
  );
  if (!response.ok) return;
  const rows = await response.json();
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row?.id || !row?.object_path) continue;
    if (await removeStorageObject(row.object_path)) {
      await rpc("messagex_mark_queue_storage_deleted", { p_queue_id: row.id });
    }
  }
}

async function handleClaim(): Promise<Response> {
  await cleanupTransferredOrCancelled();
  const result = await rpc("messagex_claim_media_queue", {});
  if (!result.response.ok) {
    console.error("Queue claim RPC failed", result.response.status, result.data);
    return json(502, { error: "Could not claim queued media." });
  }
  const item = Array.isArray(result.data) ? result.data[0] : null;
  if (!item) return json(200, { ok: true, item: null });

  const signResponse = await serviceRequest(
    `/storage/v1/object/sign/${queueBucket}/${encodedPath(item.object_path)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 }),
    },
  );
  const signText = await signResponse.text();
  let signed: Record<string, unknown> | null = null;
  try { signed = JSON.parse(signText); } catch { /* handled below */ }
  if (!signResponse.ok || typeof signed?.signedURL !== "string") {
    await rpc("messagex_fail_media_queue", {
      p_queue_id: item.queue_id,
      p_claim_token: item.claim_token,
      p_error: "Supabase could not create a temporary queue download URL.",
    });
    return json(502, { error: "Could not create the private queue download." });
  }
  const signedPath = signed.signedURL;
  const downloadUrl = /^https:\/\//i.test(signedPath)
    ? signedPath
    : `${supabaseUrl}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
  return json(200, {
    ok: true,
    item: {
      ...item,
      download_url: downloadUrl,
    },
  });
}

async function handleComplete(payload: Record<string, unknown>): Promise<Response> {
  const result = await rpc("messagex_complete_media_queue", {
    p_queue_id: String(payload.queue_id || ""),
    p_claim_token: String(payload.claim_token || ""),
    p_laptop_media_url: String(payload.laptop_media_url || ""),
    p_size_bytes: Number(payload.size_bytes),
    p_sha256: String(payload.sha256 || "").toLowerCase(),
  });
  if (!result.response.ok) {
    console.error("Queue complete RPC failed", result.response.status, result.data);
    return json(409, { error: "The laptop verification did not match the queued object." });
  }
  const record = Array.isArray(result.data) ? result.data[0] : result.data as Record<string, unknown> | null;
  if (!record?.object_path) return json(409, { error: "The queued object is unavailable." });

  const deleted = await removeStorageObject(String(record.object_path));
  if (!deleted) {
    return json(502, { error: "The laptop copy is verified, but temporary queue cleanup will retry." });
  }
  await rpc("messagex_mark_queue_storage_deleted", { p_queue_id: String(payload.queue_id || "") });
  return json(200, { ok: true, verified: true, temporary_copy_deleted: true, ...record });
}

async function handleFail(payload: Record<string, unknown>): Promise<Response> {
  const result = await rpc("messagex_fail_media_queue", {
    p_queue_id: String(payload.queue_id || ""),
    p_claim_token: String(payload.claim_token || ""),
    p_error: String(payload.error || "Laptop queue transfer failed").slice(0, 500),
  });
  if (!result.response.ok) return json(502, { error: "Could not release the queued media claim." });
  return json(200, { ok: result.data === true, retry_scheduled: result.data === true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Supabase service environment is unavailable" });

  const payload = await readJson(request);
  if (!payload) return json(400, { error: "Request body must be valid JSON" });
  const action = String(payload.action || "");
  if (action === "enqueue") return handleEnqueue(request, payload);
  if (action === "enqueue_profile") return handleEnqueueProfile(request, payload);
  if (action === "set_profile") return handleSetProfile(request, payload);

  if (!(await authorizeLaptop(request))) return json(401, { error: "Invalid laptop queue credential" });
  if (action === "claim") return handleClaim();
  if (action === "complete") return handleComplete(payload);
  if (action === "fail") return handleFail(payload);
  return json(400, { error: "Unknown queue action" });
});
