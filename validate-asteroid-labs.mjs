import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const managerPath = path.resolve(root, '..', '..', 'outputs', 'Asteroid-Labs-Manager.html');
const keyPath = path.resolve(root, '..', '..', 'outputs', 'asteroid-labs-admin-key.json');
const read = (file) => fs.readFileSync(file, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parseInlineScripts = (file) => {
  const source = read(file);
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => new vm.Script(match[1], { filename: `${file}#script-${index + 1}` }));
  return scripts.length;
};

const index = read(path.join(root, 'index.html'));
const publicPage = read(path.join(root, 'asteroid-labs.html'));
const manager = read(managerPath);
const migration = read(path.join(root, 'supabase', 'migrations', '20260813001012_asteroid_labs_projects.sql'));
const edgeFunction = read(path.join(root, 'supabase', 'functions', 'asteroid-labs-admin', 'index.ts'));
const config = read(path.join(root, 'supabase', 'functions', 'asteroid-labs-admin', 'config.toml'));
const adminKey = JSON.parse(read(keyPath)).adminKey;
const adminKeyHash = crypto.createHash('sha256').update(adminKey).digest('hex');

assert(index.includes("logo.addEventListener('click',tap)"), 'Boot unlock is not attached to the regular logo.');
assert(index.includes('taps+=1') && index.includes('if(taps<5)return'), 'Boot unlock does not require exactly five taps.');
assert(index.includes("art.src='assets/asteroid-labs.jpg'"), 'The supplied Asteroid Labs artwork is not used by the boot takeover.');
assert(index.includes("new URL('asteroid-labs.html',document.baseURI)"), 'Boot takeover does not open the Labs page.');
assert(publicPage.includes('/rest/v1/asteroid_labs_projects'), 'Public Labs page is not backed by Supabase.');
assert(!publicPage.includes('Asteroid-Labs-Manager') && !index.includes('Asteroid-Labs-Manager'), 'The separate manager is linked from a public page.');
assert(manager.includes('type="file"') && manager.includes('x-asteroid-labs-admin-key'), 'Manager does not load and use the separate publishing key.');
assert(migration.includes('enable row level security'), 'Asteroid Labs table does not enable RLS.');
assert(migration.includes('grant select on table public.asteroid_labs_projects to anon, authenticated'), 'Public read access is missing.');
assert(!migration.match(/grant\s+(insert|update|delete|all).*\b(anon|authenticated)\b/i), 'Public roles have write permission.');
assert(config.includes('verify_jwt = false'), 'Edge Function custom-key configuration is missing.');
assert(edgeFunction.includes(adminKeyHash), 'Manager key does not match the protected Edge Function.');
assert(!index.includes(adminKey) && !publicPage.includes(adminKey) && !edgeFunction.includes(adminKey), 'The private manager key leaked into a published file.');
assert(fs.statSync(path.join(root, 'assets', 'asteroid-labs.jpg')).size > 20000, 'Asteroid Labs artwork is missing or incomplete.');

const publicScripts = parseInlineScripts(path.join(root, 'asteroid-labs.html'));
const managerScripts = parseInlineScripts(managerPath);
console.log(`Asteroid Labs validation passed: ${publicScripts} public script, ${managerScripts} manager script, RLS read-only policy, five-tap boot unlock, protected publisher.`);
