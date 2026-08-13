const expectedAdminKeyHash = "6599684b8e5f69af8cb839f1d079a9e7be8d4f4f5563dcb6779f0662025b7417";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-asteroid-labs-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
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

function cleanText(value: unknown, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

function cleanSlug(value: unknown): string {
  return cleanText(value, 90).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cleanTags(value: unknown): string[] {
  const tags = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(tags.map((tag) => cleanText(tag, 24)).filter(Boolean))].slice(0, 8);
}

async function databaseRequest(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const suppliedHash = await sha256Hex(request.headers.get("x-asteroid-labs-admin-key") || "");
  if (!constantTimeEqual(suppliedHash, expectedAdminKeyHash)) return json(401, { error: "The Asteroid Labs publishing key is not valid." });
  if (!supabaseUrl || !serviceRoleKey) return json(503, { error: "The publishing service is not configured." });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const action = cleanText(body.action, 20);
  if (action === "list") {
    const response = await databaseRequest(
      "/rest/v1/asteroid_labs_projects?select=*&order=status.asc,display_order.asc,updated_at.desc",
      { method: "GET" },
    );
    if (!response.ok) return json(502, { error: "The project list could not be loaded." });
    return json(200, { ok: true, projects: await response.json() });
  }
  if (action === "delete") {
    const id = cleanText(body.id, 50);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "A valid project ID is required." });
    const response = await databaseRequest(`/rest/v1/asteroid_labs_projects?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return json(502, { error: "The project could not be deleted." });
    return json(200, { ok: true });
  }

  if (action !== "save") return json(400, { error: "Unknown action." });
  const project = body.project && typeof body.project === "object" ? body.project as Record<string, unknown> : {};
  const title = cleanText(project.title, 80);
  const summary = cleanText(project.summary, 600);
  const status = cleanText(project.status, 20);
  if (!title) return json(400, { error: "Add a project name." });
  if (!summary) return json(400, { error: "Add a short project description." });
  if (!["future", "development", "archived", "canceled"].includes(status)) return json(400, { error: "Choose a valid project group." });

  const record = {
    slug: cleanSlug(project.slug || title) || crypto.randomUUID(),
    title,
    summary,
    status,
    stage: cleanText(project.stage, 40) || "Concept",
    target_label: cleanText(project.target_label, 60),
    tags: cleanTags(project.tags),
    accent: /^#[0-9a-f]{6}$/i.test(String(project.accent || "")) ? String(project.accent) : "#ffffff",
    display_order: Math.max(-10000, Math.min(10000, Number(project.display_order) || 0)),
    visible: project.visible !== false,
    updated_at: new Date().toISOString(),
  };

  const id = cleanText(project.id, 50);
  const isUpdate = /^[0-9a-f-]{36}$/i.test(id);
  const response = await databaseRequest(
    isUpdate ? `/rest/v1/asteroid_labs_projects?id=eq.${encodeURIComponent(id)}` : "/rest/v1/asteroid_labs_projects",
    { method: isUpdate ? "PATCH" : "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) },
  );
  const responseText = await response.text();
  if (!response.ok) {
    let detail = "The project could not be published.";
    try { detail = JSON.parse(responseText)?.message || detail; } catch { /* keep safe message */ }
    return json(502, { error: detail });
  }
  let saved: unknown = null;
  try { saved = JSON.parse(responseText)?.[0] || null; } catch { /* empty response */ }
  return json(200, { ok: true, project: saved });
});
