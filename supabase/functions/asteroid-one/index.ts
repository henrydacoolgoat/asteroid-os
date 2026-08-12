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
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, ...extra };
}

async function serviceRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers as Record<string, string> || {}),
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function authorizeLaptop(request: Request): Promise<boolean> {
  return constantTimeEqual(
    await sha256Hex(request.headers.get("x-messagex-heartbeat-secret") || ""),
    expectedHeartbeatSecretHash,
  );
}

async function userFromRequest(request: Request): Promise<{ id: string } | null> {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] === serviceRoleKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${match[1]}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? { id: user.id } : null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

async function rpc(name: string, body: Record<string, unknown>): Promise<{ response: Response; data: unknown }> {
  const response = await serviceRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

function encodedPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function storageObjectExists(objectPath: string, expectedSize: number): Promise<boolean> {
  const parts = objectPath.split("/");
  const fileName = parts.pop();
  const response = await serviceRequest(`/storage/v1/object/list/${queueBucket}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: parts.join("/"), search: fileName, limit: 10, offset: 0 }),
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.some((row) => row?.name === fileName && Number(row?.metadata?.size) === expectedSize);
}

function filePayload(payload: Record<string, unknown>) {
  return {
    fileId: String(payload.file_id || ""),
    parentId: String(payload.parent_id || "Home"),
    name: String(payload.name || "").slice(0, 180),
    mimeType: String(payload.mime_type || "application/octet-stream").slice(0, 180).toLowerCase(),
    sizeBytes: Number(payload.size_bytes),
    sha256: String(payload.sha256 || "").toLowerCase(),
    modifiedAt: String(payload.modified_at || ""),
  };
}

function validFilePayload(file: ReturnType<typeof filePayload>): boolean {
  return /^file-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(file.fileId)
    && /^(Home|Desktop|Documents|Downloads|Pictures|Music|Videos|folder-[0-9a-f-]{36})$/.test(file.parentId)
    && file.name.length >= 1 && file.name.length <= 180 && !/[\\/:*?"<>|]/.test(file.name)
    && Number.isInteger(file.sizeBytes) && file.sizeBytes >= 1 && file.sizeBytes <= 104857600
    && /^[0-9a-f]{64}$/.test(file.sha256) && Number.isFinite(Date.parse(file.modifiedAt));
}

async function handleRegister(request: Request, payload: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: "Your Asteroid session expired. Sign in again." });
  const file = filePayload(payload);
  const storageRef = String(payload.storage_ref || "");
  if (!validFilePayload(file) || !/^asteroid-one:\/files\/[a-f0-9]{32}\/file-[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(storageRef)) {
    return json(400, { error: "Invalid Asteroid ONE file metadata." });
  }
  const result = await rpc("asteroid_one_register_file", {
    p_file_id: file.fileId, p_owner_user_id: user.id, p_parent_id: file.parentId,
    p_name: file.name, p_mime_type: file.mimeType, p_size_bytes: file.sizeBytes,
    p_sha256: file.sha256, p_storage_ref: storageRef, p_modified_at: file.modifiedAt,
  });
  if (!result.response.ok) {
    console.error("Asteroid ONE register failed", result.response.status, result.data);
    return json(403, { error: "Asteroid ONE could not register the saved file." });
  }
  return json(201, { ok: true, file: Array.isArray(result.data) ? result.data[0] : result.data });
}

async function handleEnqueue(request: Request, payload: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: "Your Asteroid session expired. Sign in again." });
  const file = filePayload(payload);
  const queueId = String(payload.queue_id || "").toLowerCase();
  const objectPath = String(payload.object_path || "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const prefix = `${user.id}/asteroid-one/${queueId}/`;
  if (!validFilePayload(file) || !uuid.test(queueId) || !objectPath.startsWith(prefix)
      || !/^[a-zA-Z0-9._-]{1,180}$/.test(objectPath.slice(prefix.length))) {
    return json(400, { error: "Invalid queued Asteroid ONE file." });
  }
  if (!(await storageObjectExists(objectPath, file.sizeBytes))) {
    return json(409, { error: "The private Asteroid ONE queue object is missing or incomplete." });
  }
  const result = await rpc("asteroid_one_enqueue_file", {
    p_queue_id: queueId, p_file_id: file.fileId, p_owner_user_id: user.id,
    p_parent_id: file.parentId, p_name: file.name, p_object_path: objectPath,
    p_mime_type: file.mimeType, p_size_bytes: file.sizeBytes, p_sha256: file.sha256,
    p_modified_at: file.modifiedAt,
  });
  if (!result.response.ok) {
    console.error("Asteroid ONE enqueue failed", result.response.status, result.data);
    return json(403, { error: "The queued Asteroid ONE file could not be created." });
  }
  return json(201, { ok: true, queued: true, file: Array.isArray(result.data) ? result.data[0] : result.data });
}

async function handleDeleteRecord(request: Request, payload: Record<string, unknown>): Promise<Response> {
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: "Your Asteroid session expired. Sign in again." });
  const fileId = String(payload.file_id || "").toLowerCase();
  if (!/^(file|folder)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fileId)) {
    return json(400, { error: "Invalid Asteroid ONE item." });
  }
  const lookup = await serviceRequest(
    `/rest/v1/asteroid_one_files?id=eq.${encodeURIComponent(fileId)}&owner_user_id=eq.${encodeURIComponent(user.id)}&select=id,queue_id&limit=1`,
  );
  if (!lookup.ok) return json(502, { error: "Asteroid ONE could not verify this item." });
  const rows = await lookup.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json(404, { error: "Asteroid ONE item not found." });
  if (row.queue_id) {
    const queueLookup = await serviceRequest(
      `/rest/v1/asteroid_one_transfer_queue?id=eq.${encodeURIComponent(row.queue_id)}&select=object_path&limit=1`,
    );
    const queueRows = queueLookup.ok ? await queueLookup.json() : [];
    const objectPath = Array.isArray(queueRows) ? queueRows[0]?.object_path : null;
    if (objectPath) await removeStorageObject(objectPath);
  }
  const deleted = await serviceRequest(
    `/rest/v1/asteroid_one_files?id=eq.${encodeURIComponent(fileId)}&owner_user_id=eq.${encodeURIComponent(user.id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  return deleted.ok ? json(200, { ok: true, deleted: true }) : json(502, { error: "Asteroid ONE could not remove this item." });
}

async function removeStorageObject(objectPath: string): Promise<boolean> {
  const response = await serviceRequest(`/storage/v1/object/${queueBucket}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
  return response.ok;
}

async function cleanupTransferred(): Promise<void> {
  const response = await serviceRequest(
    "/rest/v1/asteroid_one_transfer_queue?status=in.(completed,cancelled)&storage_deleted_at=is.null&select=id,object_path&limit=10",
  );
  if (!response.ok) return;
  const rows = await response.json();
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (row?.id && row?.object_path && await removeStorageObject(row.object_path)) {
      await rpc("asteroid_one_mark_storage_deleted", { p_queue_id: row.id });
    }
  }
}

async function handleClaim(): Promise<Response> {
  await cleanupTransferred();
  const result = await rpc("asteroid_one_claim_transfer", {});
  if (!result.response.ok) return json(502, { error: "Could not claim an Asteroid ONE transfer." });
  const item = Array.isArray(result.data) ? result.data[0] : null;
  if (!item) return json(200, { ok: true, item: null });
  const signedResponse = await serviceRequest(`/storage/v1/object/sign/${queueBucket}/${encodedPath(item.object_path)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }),
  });
  const signed = await signedResponse.json().catch(() => null);
  if (!signedResponse.ok || typeof signed?.signedURL !== "string") {
    await rpc("asteroid_one_fail_transfer", {
      p_queue_id: item.queue_id, p_claim_token: item.claim_token,
      p_error: "Supabase could not create the temporary Asteroid ONE download URL.",
    });
    return json(502, { error: "Could not create the private Asteroid ONE queue download." });
  }
  const downloadUrl = /^https:\/\//i.test(signed.signedURL)
    ? signed.signedURL
    : `${supabaseUrl}/storage/v1${signed.signedURL.startsWith("/") ? "" : "/"}${signed.signedURL}`;
  return json(200, { ok: true, item: { ...item, download_url: downloadUrl } });
}

async function handleComplete(payload: Record<string, unknown>): Promise<Response> {
  const result = await rpc("asteroid_one_complete_transfer", {
    p_queue_id: String(payload.queue_id || ""), p_claim_token: String(payload.claim_token || ""),
    p_storage_ref: String(payload.storage_ref || ""), p_size_bytes: Number(payload.size_bytes),
    p_sha256: String(payload.sha256 || "").toLowerCase(),
  });
  if (!result.response.ok) return json(409, { error: "The Asteroid ONE laptop verification did not match." });
  const record = Array.isArray(result.data) ? result.data[0] : result.data as Record<string, unknown> | null;
  if (!record?.object_path) return json(409, { error: "The queued Asteroid ONE object is unavailable." });
  if (!(await removeStorageObject(String(record.object_path)))) {
    return json(502, { error: "The laptop copy is verified, but temporary cleanup will retry." });
  }
  await rpc("asteroid_one_mark_storage_deleted", { p_queue_id: String(payload.queue_id || "") });
  return json(200, { ok: true, verified: true, temporary_copy_deleted: true, ...record });
}

async function handleFail(payload: Record<string, unknown>): Promise<Response> {
  const result = await rpc("asteroid_one_fail_transfer", {
    p_queue_id: String(payload.queue_id || ""), p_claim_token: String(payload.claim_token || ""),
    p_error: String(payload.error || "Asteroid ONE transfer failed").slice(0, 500),
  });
  return result.response.ok
    ? json(200, { ok: result.data === true, retry_scheduled: result.data === true })
    : json(502, { error: "Could not release the Asteroid ONE transfer claim." });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Supabase service environment is unavailable" });
  const payload = await readJson(request);
  if (!payload) return json(400, { error: "Request body must be valid JSON" });
  const action = String(payload.action || "");
  if (action === "register") return handleRegister(request, payload);
  if (action === "enqueue") return handleEnqueue(request, payload);
  if (action === "delete_record") return handleDeleteRecord(request, payload);
  if (!(await authorizeLaptop(request))) return json(401, { error: "Invalid Asteroid ONE laptop credential" });
  if (action === "claim") return handleClaim();
  if (action === "complete") return handleComplete(payload);
  if (action === "fail") return handleFail(payload);
  return json(400, { error: "Unknown Asteroid ONE action" });
});
