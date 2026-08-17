import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const iconBytes = await readFile(new URL('./assets/asteroid-os-one-app-icons.png', import.meta.url));

const expectedIcons = [
  'launchpad', 'finder', 'messages', 'shards', 'freeperiod',
  'mail', 'asteroidbrowser', 'comet', 'maps', 'photos',
  'camera', 'notes', 'calendar', 'calculator', 'terminal',
  'settings', 'appstore', 'contacts', 'music'
];

const iconMapMatch = page.match(/const iconSpritePositions=\{([\s\S]*?)\n  \};/);
const iconMap = iconMapMatch?.[1] || '';
const pngSignature = iconBytes.subarray(0, 8).toString('hex');
const pngWidth = iconBytes.readUInt32BE(16);
const pngHeight = iconBytes.readUInt32BE(20);

const checks = [
  ['visible brand is Asteroid OS One', page.includes('<meta name="application-name" content="Asteroid OS One"') && page.includes('<title>Asteroid OS One v0.99.23.13')],
  ['release metadata uses one consistent build id', page.includes('<meta name="asteroid-build" content="asteroid-os-one-v0.99.23.13-2026-08-17"') && page.includes("const ASTEROID_RELEASE_BUILD='asteroid-os-one-v0.99.23.13-2026-08-17';")],
  ['top-level document replacement guard loads before application markup', page.indexOf('__asteroidTopDocumentGuardInstalled') > page.indexOf('<script id="asteroid-top-level-guard">') && page.indexOf('__asteroidTopDocumentGuardInstalled') < page.indexOf('id="asteroidAuthGate"') && page.indexOf('__asteroidTopDocumentGuardInstalled') < page.indexOf('id="messageXEmbeddedSource"') && page.includes("const asteroidShellDocument=document.querySelector('meta[name=\"asteroid-build\"]')?.content?.startsWith('asteroid-os-one-')===true;") && page.includes("if(asteroidShellDocument&&!window.__asteroidTopDocumentGuardInstalled)") && page.includes("documentPrototype.open=function(...args){blocked('open',args[0]);return document}") && page.includes("documentPrototype.write=function(...args){blocked('write',args[0])}")],
  ['legacy OPFS name is retained for existing user files', page.includes("getDirectoryHandle('Asteroid OS',{create:true})")],
  ['new shell override is present', page.includes('<style id="asteroid-os-one-shell-style">')],
  ['system shelf is fixed to the bottom', /#menuBar\{[\s\S]*?position:fixed!important;[\s\S]*?top:auto!important;[\s\S]*?bottom:0!important;/.test(page)],
  ['system shelf is fully opaque black', /#menuBar\{[\s\S]*?background:#000!important;[\s\S]*?backdrop-filter:none!important;/.test(page)],
  ['old top-bar menus are removed from the shelf', page.includes('#menuBar .menu-left>.menu-hide-mobile{display:none!important}')],
  ['dock is integrated instead of floating glass', /#dock\{[\s\S]*?background:#000!important;[\s\S]*?backdrop-filter:none!important;[\s\S]*?border-radius:0!important;/.test(page)],
  ['window layer stops above the bottom shelf', /#windowLayer\{inset:0 0 var\(--system-bar-h\) 0!important\}/.test(page)],
  ['window controls use standard minimize, maximize, and close glyphs', page.includes('<button class="min-btn" aria-label="Minimize" title="Minimize"><span aria-hidden="true">—</span></button><button class="max-btn" aria-label="Maximize" title="Maximize"><span aria-hidden="true">□</span></button><button class="close-btn" aria-label="Close" title="Close"><span aria-hidden="true">×</span></button>') && /\.traffic button\{[\s\S]*?border-radius:5px!important;/.test(page) && /\.traffic button::after\{content:none!important\}/.test(page)],
  ['supplied icon artwork is an intact PNG', pngSignature === '89504e470d0a1a0a' && pngWidth === 1448 && pngHeight === 1086],
  ['sprite renderer uses the repository artwork', page.includes("background-image:url('assets/asteroid-os-one-app-icons.png')!important") && page.includes('const sprite=iconSpritePositions[resolved];')],
  ['all 19 supplied app icons are mapped', expectedIcons.every(icon => new RegExp(`\\b${icon}:\\[`).test(iconMap))]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  ok: failures.length === 0,
  iconAsset: { width: pngWidth, height: pngHeight, bytes: iconBytes.length },
  mappedIcons: expectedIcons.length,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks: Object.fromEntries(checks)
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
