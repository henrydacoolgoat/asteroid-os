import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');
const client = await read('index.html');
const migration = await read('supabase', 'migrations', '20260812201500_add_asteroid_one_files.sql');
const hardening = await read('supabase', 'migrations', '20260812203000_harden_asteroid_one_file_updates.sql');
const fileTypes = await read('supabase', 'migrations', '20260812210000_allow_asteroid_one_file_types.sql');
const queueBase = await read('supabase', 'migrations', '20260812143000_add_messagex_media_queue.sql');
const edge = await read('supabase', 'functions', 'asteroid-one', 'index.ts');

const checks = [
  ['release and feature build markers are present', client.includes('asteroid-os-one-v0.99.23.18-2026-08-18') && client.includes("const ASTEROID_ONE_BUILD='asteroid-one-files-account-state-2026-08-12';")],
  ['Files is presented as Asteroid ONE', client.includes('<span>Asteroid ONE</span>') && client.includes('Your laptop storage, available to this account on every device')],
  ['direct laptop uploads use multipart form data and account authorization', client.includes("form.append('file',blob") && client.includes("'/api/one/upload?'") && client.includes("Authorization:'Bearer '+session.access_token")],
  ['offline uploads use the private Supabase queue', client.includes("const ASTEROID_ONE_QUEUE_BUCKET='messagex-media-queue';") && client.includes('asteroidOneQueueFile(item,blob,session,sha256)')],
  ['queued files preserve a checksum and original timestamp', client.includes('sha256,modified_at:new Date(item.modified||Date.now()).toISOString()')],
  ['protected downloads require an owner ticket', client.includes("'/api/one/ticket'") && client.includes('file_id:item.id') && client.includes("if(!fileResponse.ok)throw new Error('Asteroid ONE could not download this file.')")],
  ['settings and supported account state are snapshotted to the laptop', client.includes("'/api/one/state'") && client.includes('notes:syncPayload.notes,contacts:syncPayload.contacts') && client.includes('photos:state.filesItems.filter')],
  ['snapshot deliberately excludes secrets', !/app_state:\{[^}]*access_token/s.test(client) && !/app_state:\{[^}]*geminiApiKey/s.test(client)],
  ['reconnect and periodic sync are enabled', client.includes("window.addEventListener('online'") && client.includes('},30000);updateAsteroidSyncStatusUI()')],
  ['laptop status comes from the public health endpoint', client.includes("asteroidOneGatewayRequest('/healthz')") && client.includes("health?.ok&&health?.asteroid_one")],
  ['file metadata and transfer queue both enforce RLS', (migration.match(/enable row level security/gi)||[]).length >= 2],
  ['file rows are restricted to the authenticated owner', migration.includes('owner_user_id=(select auth.uid())') && migration.includes('with check (owner_user_id=(select auth.uid()))')],
  ['queue object paths are scoped to the authenticated account', migration.includes("(storage.foldername(storage.objects.name))[1]=(select auth.uid())::text") && migration.includes("(storage.foldername(storage.objects.name))[2]='asteroid-one'")],
  ['browser clients cannot forge the permanent status', hardening.includes('revoke update(status)')],
  ['the private queue accepts Files content up to 100 MB', queueBase.includes("'messagex-media-queue',\n  'messagex-media-queue',\n  false") && fileTypes.includes('file_size_limit=104857600') && fileTypes.includes('allowed_mime_types=null')],
  ['only the service role can claim or complete transfers', migration.includes('grant execute on function public.asteroid_one_claim_transfer') && migration.includes('to service_role') && migration.includes('revoke all on function public.asteroid_one_complete_transfer')],
  ['Edge actions verify either the signed-in owner or laptop secret', edge.includes('userFromRequest(request)') && edge.includes('authorizeLaptop(request)')],
  ['Edge completion verifies both byte count and SHA-256', edge.includes('p_size_bytes: Number(payload.size_bytes)') && edge.includes('p_sha256: String(payload.sha256 || "").toLowerCase()')],
  ['temporary storage is removed only after completion', edge.includes('action === "complete"') && edge.includes('removeStorageObject(String(record.object_path))') && edge.includes('"asteroid_one_mark_storage_deleted"')],
  ['there is no rotating Quick Tunnel origin in the Asteroid ONE client', !client.slice(client.indexOf("const ASTEROID_ONE_ORIGIN"), client.indexOf('function fileSvgIcon')).includes('trycloudflare.com')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Asteroid ONE checks passed.`);
if (failed) process.exitCode = 1;
