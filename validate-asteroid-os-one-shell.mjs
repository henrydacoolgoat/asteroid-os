import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

const expectedIcons = [
  'launchpad', 'finder', 'messages', 'shards', 'freeperiod',
  'mail', 'asteroidbrowser', 'comet', 'maps', 'photos',
  'camera', 'notes', 'calendar', 'calculator', 'terminal',
  'settings', 'appstore', 'contacts', 'music'
];

const iconFiles = await Promise.all(expectedIcons.map(async icon => ({
  icon,
  bytes: await readFile(new URL(`./assets/asteroid-icons-v3/${icon}.png`, import.meta.url))
})));
const iconMapMatch = page.match(/const iconFilePaths=Object\.freeze\(\{([\s\S]*?)\n  \}\);/);
const iconMap = iconMapMatch?.[1] || '';
const validRgbaIcons = iconFiles.filter(({ bytes }) => (
  bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
  bytes.readUInt32BE(16) === 256 &&
  bytes.readUInt32BE(20) === 256 &&
  bytes[25] === 6
));

const checks = [
  ['visible brand is Asteroid OS One', page.includes('<meta name="application-name" content="Asteroid OS One"') && page.includes('<title>Asteroid OS One v0.99.23.18')],
  ['release metadata uses one consistent build id', page.includes('<meta name="asteroid-build" content="asteroid-os-one-v0.99.23.18-2026-08-18"') && page.includes("const ASTEROID_RELEASE_BUILD='asteroid-os-one-v0.99.23.18-2026-08-18';")],
  ['top-level document replacement guard loads before application markup', page.indexOf('__asteroidTopDocumentGuardInstalled') > page.indexOf('<script id="asteroid-top-level-guard">') && page.indexOf('__asteroidTopDocumentGuardInstalled') < page.indexOf('id="asteroidAuthGate"') && page.indexOf('__asteroidTopDocumentGuardInstalled') < page.indexOf('id="messageXEmbeddedSource"') && page.includes("const asteroidShellDocument=document.querySelector('meta[name=\"asteroid-build\"]')?.content?.startsWith('asteroid-os-one-')===true;") && page.includes("if(asteroidShellDocument&&!window.__asteroidTopDocumentGuardInstalled)") && page.includes("documentPrototype.open=function(...args){blocked('open',args[0]);return document}") && page.includes("documentPrototype.write=function(...args){blocked('write',args[0])}")],
  ['legacy OPFS name is retained for existing user files', page.includes("getDirectoryHandle('Asteroid OS',{create:true})")],
  ['new shell override is present', page.includes('<style id="asteroid-os-one-shell-style">')],
  ['system shelf is fixed to the bottom', /#menuBar\{[\s\S]*?position:fixed!important;[\s\S]*?top:auto!important;[\s\S]*?bottom:0!important;/.test(page)],
  ['system shelf is fully opaque near-black', /#menuBar\{[\s\S]*?background:#030305!important;[\s\S]*?backdrop-filter:none!important;/.test(page)],
  ['old top-bar menus and duplicate active title are removed from the shelf', page.includes('#menuBar .menu-left>.menu-hide-mobile,#menuBar .app-title{display:none!important}')],
  ['dock is integrated into the solid shelf instead of floating glass', /#dock\{[\s\S]*?background:transparent!important;[\s\S]*?backdrop-filter:none!important;/.test(page)],
  ['shelf search opens the real Asteroid search', page.includes('id="spotlightButton" title="Find apps and files"') && page.includes("$('#spotlightButton').onclick=()=>toggleSpotlight()")],
  ['shelf shows exactly five deliberate pinned apps', page.includes("const shelfPinnedAppIds=['finder','safari','notes','calendar','settings'];") && !page.includes("appDefs.filter(a=>a.dock).forEach")],
  ['full app catalog remains available in App Grid', page.includes("appDefs.filter(a=>a.id!=='trash'&&a.id!=='launchpad')")],
  ['shelf exposes notifications and date without fake hardware indicators', page.includes('id="notificationButton" title="Notifications"') && page.includes('id="menuDate"') && !page.includes('id="controlButton"') && !page.includes('id="batteryStatus"') && !page.includes('id="lockBattery"')],
  ['shelf components use repository and licensed icon assets', ['search.svg','bell.svg'].every(name=>page.includes(`assets/ui-icons/${name}`))],
  ['notification bell is centered inside its compact button', page.includes('display:grid!important;place-items:center!important;flex:0 0 32px') && page.includes('#notificationButton>img{position:static!important;display:block!important;width:16px!important;height:16px!important;margin:0!important')],
  ['transparent icons are rendered without a clipping viewport', page.includes('.icon-host.asteroid-one-transparent-icon{') && page.includes('clip-path:none!important') && page.includes('overflow:visible!important') && !page.includes('background-size:762.105% 571.579%!important')],
  ['desktop shelf is compact at normal and scaled displays', page.includes(':root{--menu-h:0px!important;--dock-h:54px;--system-bar-h:54px}') && page.includes('width:188px!important;height:32px!important') && page.includes('width:30px!important;height:30px!important;filter:none!important')],
  ['default desktop shortcuts are hidden while user-added apps remain available', page.includes('.desktop-icons>.desktop-icon:not(.custom-home-app){display:none!important}') && page.includes("button.className='desktop-icon custom-home-app'")],
  ['dark Asteroid wallpaper is bundled and migrated for the legacy default', page.includes("state.wallpapers.push('assets/asteroid-os-one-cosmic-wallpaper-v1.png')") && page.includes("const cosmicWallpaperMigrationKey='asteroidOsOneCosmicWallpaperV1'")],
  ['window layer stops above the bottom shelf', /#windowLayer\{inset:0 0 var\(--system-bar-h\) 0!important\}/.test(page)],
  ['window controls use standard minimize, maximize, and close glyphs', page.includes('<button class="min-btn" aria-label="Minimize" title="Minimize"><span aria-hidden="true">—</span></button><button class="max-btn" aria-label="Maximize" title="Maximize"><span aria-hidden="true">□</span></button><button class="close-btn" aria-label="Close" title="Close"><span aria-hidden="true">×</span></button>') && /\.traffic button\{[\s\S]*?border-radius:5px!important;/.test(page) && /\.traffic button::after\{content:none!important\}/.test(page)],
  ['all 19 icon files are 256px RGBA PNG assets', validRgbaIcons.length === expectedIcons.length],
  ['individual icon renderer uses repository assets', page.includes('const transparentAsset=iconFilePaths[resolved];') && page.includes("el.classList.add('asteroid-one-transparent-icon')") && page.includes('img.src=transparentAsset;')],
  ['all 19 supplied app icons are mapped', expectedIcons.every(icon => new RegExp(`\\b${icon}:'assets/asteroid-icons-v3/${icon}\\.png'`).test(iconMap))]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  ok: failures.length === 0,
  iconAssets: { expected: expectedIcons.length, validRgba: validRgbaIcons.length, totalBytes: iconFiles.reduce((sum, item) => sum + item.bytes.length, 0) },
  mappedIcons: expectedIcons.length,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks: Object.fromEntries(checks)
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
