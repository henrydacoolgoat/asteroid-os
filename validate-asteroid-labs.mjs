import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const managerPath = path.resolve(root, '..', '..', 'outputs', 'Asteroid-Labs-Manager.html');
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
const baseMigration = read(path.join(root, 'supabase', 'migrations', '20260813001012_asteroid_labs_projects.sql'));
const authMigration = read(path.join(root, 'supabase', 'migrations', '20260813124315_authorize_gymguy_labs_publisher.sql'));
const edgeFunction = read(path.join(root, 'supabase', 'functions', 'asteroid-labs-admin', 'index.ts'));
const config = read(path.join(root, 'supabase', 'functions', 'asteroid-labs-admin', 'config.toml'));
const ownerId = '1086ef13-6491-4e74-80d6-57dd5fa17c71';
const retiredSecret = 'a249c';

assert(index.includes("logo.addEventListener('click',tap)"), 'Boot unlock is not attached to the regular logo.');
assert(index.includes('taps+=1') && index.includes('if(taps<5)return'), 'Boot unlock does not require five taps.');
assert(index.includes("art.src='assets/asteroid-labs.jpg'"), 'The supplied Asteroid Labs artwork is not used by the boot takeover.');
assert(index.includes("new URL('asteroid-labs.html',document.baseURI)"), 'Boot takeover does not open the Labs page.');
assert(publicPage.includes('/rest/v1/asteroid_labs_projects'), 'Public Labs page is not backed by Supabase.');
assert(publicPage.includes('/rest/v1/asteroid_labs_feature_requests'), 'Public feature requests are not backed by Supabase.');
assert(publicPage.includes('href="./index.html"') && publicPage.includes('Back to Asteroid OS'), 'Public users cannot return to Asteroid OS.');
assert(publicPage.includes('asteroid_os_session_mirror_v1'), 'Labs does not recognize the existing Asteroid tab session.');
assert(!publicPage.includes('Asteroid-Labs-Manager') && !index.includes('Asteroid-Labs-Manager'), 'The separate manager is linked from a public page.');
assert(manager.includes('/auth/v1/token?grant_type=password') && manager.includes(ownerId), 'Manager is not locked to the gymguy Auth account.');
assert(manager.includes('/rest/v1/asteroid_labs_feature_requests') && manager.includes('Feature request inbox'), 'Manager feature-request inbox is missing.');
assert(!manager.includes('type="file"') && !manager.includes('x-asteroid-labs-admin-key') && !manager.includes('adminKey'), 'Manager still uses the retired key file.');
assert(baseMigration.includes('enable row level security'), 'Asteroid Labs project table does not enable RLS.');
assert(authMigration.includes('create table if not exists public.asteroid_labs_feature_requests'), 'Feature-request table migration is missing.');
assert(authMigration.includes('Users can submit their own Labs feature requests') && authMigration.includes('(select auth.uid()) = user_id'), 'Request ownership RLS is missing.');
assert(authMigration.includes('Gymguy can review Labs feature requests') && authMigration.includes(ownerId), 'Owner review RLS is missing.');
assert(authMigration.includes("'asteroid-one-snapshots'") && authMigration.includes('delete from public.asteroid_labs_projects'), 'Demonstration-project cleanup is missing.');
assert(config.includes('verify_jwt = true'), 'Retired Edge Function still permits unauthenticated access.');
assert(edgeFunction.includes('status: 410') && !edgeFunction.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Retired publisher endpoint can still write.');
assert(!manager.includes(retiredSecret) && !publicPage.includes(retiredSecret) && !edgeFunction.includes(retiredSecret), 'Part of the retired publisher secret remains in active files.');
assert(fs.statSync(path.join(root, 'assets', 'asteroid-labs.jpg')).size > 20000, 'Asteroid Labs artwork is missing or incomplete.');

const publicScripts = parseInlineScripts(path.join(root, 'asteroid-labs.html'));
const managerScripts = parseInlineScripts(managerPath);
console.log(`Asteroid Labs validation passed: ${publicScripts} public script, ${managerScripts} manager script, gymguy-only publishing, private feature-request inbox, and five-tap boot unlock.`);
